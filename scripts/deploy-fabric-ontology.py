"""Deploy the Fabric IQ ontology item from the declarative ontology model.

Populates the **Ontology** item (`Tokenomics_Ontology`) with:
  * Entity types — with descriptions and synonyms.
  * Properties — each with a description, synonyms, and value type.
  * Relationship types — source/target between entity types.
  * Data bindings — each entity bound to its backing OneLake table, mapping only the
    columns that actually exist in that table (validated against the SQL endpoint).

Reads the enriched model from ``fabric/ontology/tokenomics-ontology.json`` (which carries
``synonyms``, ``propertyMeta`` and ``source`` per class). Auth uses
``DefaultAzureCredential`` (Azure CLI locally, managed identity/OIDC in CI). Nothing is
hard-coded: workspace/lakehouse ids come from ``FABRIC_WORKSPACE_ID`` /
``FABRIC_LAKEHOUSE_ID`` or ``.generated/tokenomics/fabric.json``.

Usage:
    python scripts/deploy-fabric-ontology.py [--what-if] [--no-bindings]
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from azure.identity import DefaultAzureCredential

REPO = Path(__file__).resolve().parents[1]
ONTOLOGY_FILE = REPO / "fabric" / "ontology" / "tokenomics-ontology.json"
FABRIC_META = REPO / ".generated" / "tokenomics" / "fabric.json"
API = "https://api.fabric.microsoft.com/v1"
ITEM_DISPLAY_NAME = "Tokenomics_Ontology"
_DB_SCOPE = "https://database.windows.net/.default"
_SQL_COPT_SS_ACCESS_TOKEN = 1256

_DOUBLE_PROPS = {
    "market_input_usd_per_million", "market_output_usd_per_million",
    "negotiated_input_usd_per_million", "negotiated_output_usd_per_million",
    "risk_score", "probability", "predicted_cost_usd", "estimated_savings_usd",
    "estimatedAnnualImpactUsd", "budget_usd",
}


def _meta() -> dict:
    if FABRIC_META.exists():
        return json.loads(FABRIC_META.read_text(encoding="utf-8-sig"))
    return {}


def _workspace_id() -> str:
    return os.environ.get("FABRIC_WORKSPACE_ID") or _meta().get("workspaceId") or sys.exit("workspaceId not found")


def _lakehouse_id() -> str:
    return os.environ.get("FABRIC_LAKEHOUSE_ID") or _meta().get("lakehouseId") or ""


def _credential() -> DefaultAzureCredential:
    return DefaultAzureCredential(exclude_interactive_browser_credential=True)


def _fabric_token() -> str:
    return _credential().get_token("https://api.fabric.microsoft.com/.default").token


def _table_columns() -> dict:
    """Return {schema.table: {columns}} from the Fabric SQL endpoint (for binding)."""
    host = os.environ.get("TOKENOMICS_SQL_ENDPOINT_HOST") or _meta().get("sqlEndpointConnectionString", "")
    lakehouse = os.environ.get("TOKENOMICS_LAKEHOUSE_NAME") or _meta().get("lakehouseName", "lh_tokenomics")
    if not host:
        return {}
    try:
        import pyodbc
    except ImportError:
        return {}
    token = _credential().get_token(_DB_SCOPE).token.encode("utf-16-le")
    tok_struct = struct.pack(f"<I{len(token)}s", len(token), token)
    cs = (
        f"Driver={{ODBC Driver 18 for SQL Server}};Server={host},1433;Database={lakehouse};"
        "Encrypt=yes;TrustServerCertificate=no;"
    )
    cols: dict = {}
    try:
        with pyodbc.connect(cs, attrs_before={_SQL_COPT_SS_ACCESS_TOKEN: tok_struct}, timeout=30) as conn:
            cur = conn.cursor()
            cur.execute("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS")
            for schema, table, column in cur.fetchall():
                cols.setdefault(f"{schema}.{table}", set()).add(column)
    except Exception as exc:  # pragma: no cover - connectivity dependent
        print(f"  (binding) could not read columns: {exc}")
    return cols


class Fabric:
    def __init__(self, token: str) -> None:
        self._token = token

    def call(self, method: str, path: str, body=None):
        data = json.dumps(body).encode() if body is not None else (b"" if method == "POST" else None)
        req = urllib.request.Request(
            f"{API}{path}", data=data, method=method,
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode()
                return resp.status, (json.loads(raw) if raw else {}), dict(resp.headers)
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode()[:900], dict(exc.headers)

    def wait(self, headers: dict):
        loc = headers.get("Location") or headers.get("location")
        if not loc:
            return "Succeeded", ""
        op = loc.rstrip("/").split("/")[-1]
        for _ in range(60):
            time.sleep(4)
            _, o, _ = self.call("GET", f"/operations/{op}")
            state = o.get("status") if isinstance(o, dict) else o
            if state in ("Succeeded", "Failed"):
                return state, (json.dumps(o.get("error", {}))[:500] if isinstance(o, dict) else "")
        return "TimedOut", ""


def _b64(obj: dict) -> str:
    return base64.b64encode(json.dumps(obj).encode()).decode()


class _Ids:
    def __init__(self) -> None:
        self._n = 1000000000001

    def next(self) -> str:
        self._n += 7
        return str(self._n)


def build_parts(ont: dict, columns: dict, lakehouse_id: str, ws: str, bind: bool) -> list:
    ids = _Ids()
    parts = [
        {"path": ".platform", "payload": _b64({
            "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
            "metadata": {"type": "Ontology", "displayName": ITEM_DISPLAY_NAME},
            "config": {"version": "2.0", "logicalId": "00000000-0000-0000-0000-000000000000"},
        }), "payloadType": "InlineBase64"},
        {"path": "definition.json", "payload": _b64({}), "payloadType": "InlineBase64"},
    ]
    entity_ids: dict = {}
    bound = 0
    for c in ont["classes"]:
        eid = ids.next()
        entity_ids[c["id"]] = eid
        pmeta = c.get("propertyMeta", {})
        seen: set = set()
        props: list = []
        prop_ids: dict = {}
        ptype: dict = {}
        for p in c.get("properties", []):
            if p in seen:
                continue
            seen.add(p)
            pid = ids.next()
            prop_ids[p] = pid
            vt = "Double" if p in _DOUBLE_PROPS else "String"
            ptype[p] = vt
            m = pmeta.get(p, {})
            prop_obj = {
                "id": pid, "name": p, "redefines": None,
                "baseTypeNamespaceType": None, "valueType": vt,
            }
            enrich = {}
            if m.get("description"):
                enrich["description"] = m["description"]
            if m.get("synonyms"):
                enrich["synonyms"] = m["synonyms"]
            if enrich:
                prop_obj["semanticEnrichment"] = enrich
            props.append(prop_obj)
        if not props:
            pid = ids.next(); prop_ids["id"] = pid; ptype["id"] = "String"
            props.append({"id": pid, "name": "id", "redefines": None,
                          "baseTypeNamespaceType": None, "valueType": "String",
                          "semanticEnrichment": {"description": "Identifier."}})
        key = next((k for k in c.get("key", []) if prop_ids.get(k) and ptype[k] == "String"), None)
        if key is None:
            key = next((n for n in prop_ids if ptype[n] == "String"), props[0]["name"])
        key_id = prop_ids[key]
        for pr in props:
            if pr["id"] == key_id:
                pr["valueType"] = "String"
        entity_obj = {
            "id": eid, "namespace": "usertypes", "baseEntityTypeId": None, "name": c["id"],
            "entityIdParts": [key_id], "displayNamePropertyId": key_id,
            "namespaceType": "Custom", "visibility": "Visible",
            "properties": props, "timeseriesProperties": [],
        }
        ent_enrich = {}
        if c.get("description"):
            ent_enrich["description"] = c["description"]
        if c.get("synonyms"):
            ent_enrich["synonyms"] = c["synonyms"]
        # Additional governed metadata for humans + AI agents.
        ent_enrich["customAttributes"] = {
            "category": c.get("category", ""),
            "backingTable": str(c.get("source", "")),
        }
        entity_obj["semanticEnrichment"] = ent_enrich
        parts.append({"path": f"EntityTypes/{eid}/definition.json",
                      "payload": _b64(entity_obj), "payloadType": "InlineBase64"})

        source = str(c.get("source", ""))
        if bind and lakehouse_id and "." in source and not source.startswith("derived:"):
            schema, _, table = source.partition(".")
            table_cols = columns.get(f"{schema}.{table}", set())
            bindings = [
                {"sourceColumnName": p, "targetPropertyId": prop_ids[p]}
                for p in prop_ids if p in table_cols
            ]
            if bindings:
                guid = str(uuid.uuid4())
                parts.append({"path": f"EntityTypes/{eid}/DataBindings/{guid}.json", "payload": _b64({
                    "id": guid,
                    "dataBindingConfiguration": {
                        "dataBindingType": "NonTimeSeries",
                        "propertyBindings": bindings,
                        "sourceTableProperties": {
                            "sourceType": "LakehouseTable",
                            "workspaceId": ws,
                            "itemId": lakehouse_id,
                            "sourceTableName": table,
                            "sourceSchema": schema,
                        },
                    },
                }), "payloadType": "InlineBase64"})
                bound += 1

    rel_by_pair = {}
    for r in ont["relationships"]:
        if r["from"] in entity_ids and r["to"] in entity_ids:
            rid = ids.next()
            rel_obj = {
                "namespace": "usertypes", "id": rid, "name": r["label"], "namespaceType": "Custom",
                "source": {"entityTypeId": entity_ids[r["from"]]},
                "target": {"entityTypeId": entity_ids[r["to"]]},
            }
            desc = f"{r['from']} {r['label']} {r['to']}" + (f" (via {r['via']})" if r.get("via") else "")
            rel_obj["semanticEnrichment"] = {"description": desc, "synonyms": [r["label"]]}
            parts.append({"path": f"RelationshipTypes/{rid}/definition.json",
                          "payload": _b64(rel_obj), "payloadType": "InlineBase64"})

    rel_count = sum(1 for p in parts if p["path"].startswith("RelationshipTypes/"))
    print(f"Ontology: {len(entity_ids)} entity types, {rel_count} relationships, {bound} data bindings")
    return parts


def _find_or_create_ontology(fab: Fabric, ws: str) -> str:
    st, items, _ = fab.call("GET", f"/workspaces/{ws}/items")
    if not isinstance(items, dict):
        sys.exit(f"Failed to list items: {st} {items}")
    existing = next((i for i in items["value"] if i.get("type") == "Ontology"
                     and i.get("displayName") == ITEM_DISPLAY_NAME), None)
    if existing:
        return existing["id"]
    print(f"Creating ontology item '{ITEM_DISPLAY_NAME}'...")
    st, _, hdr = fab.call("POST", f"/workspaces/{ws}/items", {"displayName": ITEM_DISPLAY_NAME, "type": "Ontology"})
    if st not in (200, 201, 202):
        sys.exit(f"Ontology create failed: {st}")
    state, err = fab.wait(hdr)
    if state != "Succeeded":
        sys.exit(f"Ontology create {state}: {err}")
    time.sleep(6)
    _, items, _ = fab.call("GET", f"/workspaces/{ws}/items")
    return next(i["id"] for i in items["value"] if i.get("type") == "Ontology"
                and i.get("displayName") == ITEM_DISPLAY_NAME)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--what-if", action="store_true")
    parser.add_argument("--no-bindings", action="store_true", help="Skip data bindings.")
    args = parser.parse_args()

    ont = json.loads(ONTOLOGY_FILE.read_text(encoding="utf-8"))
    ws = "" if args.what_if else _workspace_id()
    lakehouse_id = _lakehouse_id()
    do_bind = not args.no_bindings and not args.what_if
    columns = _table_columns() if do_bind else {}
    parts = build_parts(ont, columns, lakehouse_id, ws, bind=do_bind)

    if args.what_if:
        print("[what-if] no changes written.")
        return

    fab = Fabric(_fabric_token())
    oid = _find_or_create_ontology(fab, ws)
    print(f"Ontology item: {oid}")
    st, res, hdr = fab.call("POST", f"/workspaces/{ws}/items/{oid}/updateDefinition", {"definition": {"parts": parts}})
    if st not in (200, 202):
        sys.exit(f"updateDefinition failed: {st} {res}")
    state, err = fab.wait(hdr)
    if state != "Succeeded":
        sys.exit(f"Ontology definition update {state}: {err}")
    print("Ontology deployed with metadata, synonyms, and data bindings.")


if __name__ == "__main__":
    main()
