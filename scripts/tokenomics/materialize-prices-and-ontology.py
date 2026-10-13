"""Materialize the `prices` and `ontology` schemas into Fabric OneLake.

Creates real, queryable Delta tables so they appear in the Fabric Lakehouse:
  prices.token_price_history        - governed effective-dated token prices
  prices.ai_credit_price_history    - Copilot Studio AI credit rates (USD per credit)
  ontology.ontology_class           - business classes + descriptions + table mapping
  ontology.ontology_property        - properties per class
  ontology.ontology_relationship    - relationships between classes

Auth: AzureCliCredential (same identity as the rest of the OneLake tooling).
Nothing is hard-coded: workspace/lakehouse ids come from generated Fabric metadata.
"""
import json
import os
import shutil
from pathlib import Path

import pyarrow as pa
from azure.identity import AzureCliCredential
from azure.storage.filedatalake import DataLakeServiceClient
from deltalake import write_deltalake

REPO = Path(r"C:\Projects\APIM\FabricIQ-FoundryIQ-CostOps")
STAGING = REPO / ".generated" / "tokenomics" / "staging" / "Tables"
ONELAKE = "https://onelake.dfs.fabric.microsoft.com"


def to_arrow(records):
    if not records:
        raise RuntimeError("no records")
    fields, data = [], {}
    for name in records[0].keys():
        sample = next((r[name] for r in records if r.get(name) is not None), None)
        if isinstance(sample, bool):
            t = pa.bool_()
        elif isinstance(sample, int):
            t = pa.int64()
        elif isinstance(sample, float):
            t = pa.float64()
        else:
            t = pa.string()
            records = [{**r, name: (None if r.get(name) is None else str(r.get(name)))} for r in records]
        fields.append(pa.field(name, t, nullable=True))
        data[name] = [r.get(name) for r in records]
    return pa.Table.from_pydict(data, schema=pa.schema(fields))


def write_local(schema, table, records):
    path = STAGING / schema / table
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)
    write_deltalake(str(path), to_arrow(records), mode="overwrite")
    print(f"  built {schema}.{table} ({len(records)} rows)")
    return path


def build_prices():
    seed = REPO / ".generated" / "tokenomics" / "seed" / "reference" / "model_price_history.jsonl"
    rows = [json.loads(l) for l in seed.read_text(encoding="utf-8").splitlines() if l.strip()]
    write_local("prices", "token_price_history", rows)
    credit_seed = REPO / ".generated" / "tokenomics" / "seed" / "reference" / "ai_credit_price_history.jsonl"
    credit_rows = [json.loads(l) for l in credit_seed.read_text(encoding="utf-8").splitlines() if l.strip()]
    write_local("prices", "ai_credit_price_history", credit_rows)
    return len(rows)


def build_ontology():
    ont = json.load(open(REPO / "fabric" / "ontology" / "tokenomics-ontology.json", encoding="utf-8"))
    classes, props = [], []
    for c in ont["classes"]:
        classes.append({
            "class_id": c["id"],
            "label": c["label"],
            "category": c["category"],
            "description": c["description"],
            "source_table": c.get("source", ""),
            "key_columns": ", ".join(c.get("key", [])),
            "parent_class": c.get("parent", ""),
            "subclasses": ", ".join(c.get("subclasses", [])),
        })
        for p in c.get("properties", []):
            props.append({"class_id": c["id"], "class_label": c["label"], "property_name": p})
    rels = [{
        "from_class": r["from"], "to_class": r["to"], "relationship": r["label"],
        "relationship_type": r["type"], "join_via": r.get("via", ""),
    } for r in ont["relationships"]]
    write_local("ontology", "ontology_class", classes)
    write_local("ontology", "ontology_property", props)
    write_local("ontology", "ontology_relationship", rels)
    return len(classes), len(props), len(rels)


def upload(schema):
    meta = json.load(open(REPO / ".generated" / "tokenomics" / "fabric.json", encoding="utf-8-sig"))
    ws, lh = meta["workspaceId"], meta["lakehouseId"]
    fs = DataLakeServiceClient(account_url=ONELAKE, credential=AzureCliCredential()).get_file_system_client(ws)
    schema_dir = STAGING / schema
    for table_dir in [d for d in schema_dir.iterdir() if d.is_dir()]:
        remote = f"{lh}/Tables/{schema}/{table_dir.name}"
        try:
            fs.get_directory_client(remote).delete_directory()
        except Exception:
            pass
        fs.get_directory_client(remote).create_directory()
        n = 0
        for fp in sorted(table_dir.rglob("*")):
            if fp.is_file():
                rel = fp.relative_to(table_dir).as_posix()
                fs.get_file_client(f"{remote}/{rel}").upload_data(fp.read_bytes(), overwrite=True)
                n += 1
        print(f"  uploaded {schema}.{table_dir.name} ({n} files)")


print("1. Building prices schema...")
build_prices()
print("2. Building ontology schema...")
build_ontology()
print("3. Uploading prices -> OneLake...")
upload("prices")
print("4. Uploading ontology -> OneLake...")
upload("ontology")
print("DONE")
