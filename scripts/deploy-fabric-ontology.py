"""Deploy the Fabric IQ ontology (GraphModel) from the declarative ontology model.

Idempotently creates the ``Tokenomics_Ontology`` item in the Fabric workspace (which
provisions its companion GraphModel), then writes the entity types (node types),
their properties, and the relationships (edge types) from
``fabric/ontology/tokenomics-ontology.json`` into the GraphModel definition via the
Fabric REST API.

The ontology is a Fabric *item*, not an Azure ARM resource, so it is deployed here
(from CI/CD or locally) rather than via Bicep/Terraform. Auth uses
``DefaultAzureCredential`` (Azure CLI locally, OIDC/managed identity in CI) against
the Fabric API. Nothing is hard-coded: workspace id comes from the generated Fabric
metadata or the ``FABRIC_WORKSPACE_ID`` environment variable.

Usage:
    python scripts/deploy-fabric-ontology.py [--what-if]
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from azure.identity import DefaultAzureCredential

REPO = Path(__file__).resolve().parents[1]
ONTOLOGY_FILE = REPO / "fabric" / "ontology" / "tokenomics-ontology.json"
FABRIC_META = REPO / ".generated" / "tokenomics" / "fabric.json"
API = "https://api.fabric.microsoft.com/v1"
ITEM_DISPLAY_NAME = "Tokenomics_Ontology"

# GQL scalar type names used by the GraphModel definition.
_DOUBLE_PROPS = {
    "market_input_usd_per_million", "market_output_usd_per_million",
    "negotiated_input_usd_per_million", "negotiated_output_usd_per_million",
    "risk_score", "probability", "predicted_cost_usd", "estimated_savings_usd",
    "estimatedAnnualImpactUsd", "budget_usd",
}


def _workspace_id() -> str:
    env = os.environ.get("FABRIC_WORKSPACE_ID")
    if env:
        return env
    if FABRIC_META.exists():
        return json.loads(FABRIC_META.read_text(encoding="utf-8-sig"))["workspaceId"]
    sys.exit("workspaceId not found: set FABRIC_WORKSPACE_ID or generate .generated/tokenomics/fabric.json")


def _token() -> str:
    return DefaultAzureCredential(exclude_interactive_browser_credential=True).get_token(
        "https://api.fabric.microsoft.com/.default"
    ).token


class Fabric:
    def __init__(self, token: str) -> None:
        self._token = token

    def call(self, method: str, path: str, body: dict | None = None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(
            f"{API}{path}", data=data, method=method,
            headers={"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                raw = resp.read().decode()
                return resp.status, (json.loads(raw) if raw else {}), dict(resp.headers)
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read().decode()[:900], dict(exc.headers)

    def wait(self, headers: dict) -> tuple[str, str]:
        loc = headers.get("Location") or headers.get("location")
        if not loc:
            return "Succeeded", ""
        op = loc.rstrip("/").split("/")[-1]
        for _ in range(45):
            time.sleep(4)
            _, o, _ = self.call("GET", f"/operations/{op}")
            state = o.get("status") if isinstance(o, dict) else o
            if state in ("Succeeded", "Failed"):
                err = json.dumps(o.get("error", {}))[:500] if isinstance(o, dict) else ""
                return state, err
        return "TimedOut", ""


def _build_graph_type(ont: dict) -> dict:
    node_types = []
    for c in ont["classes"]:
        seen, props = set(), []
        for p in c.get("properties", []):
            if p in seen:
                continue
            seen.add(p)
            props.append({"name": p, "alias": p, "type": ("FLOAT64" if p in _DOUBLE_PROPS else "STRING")})
        if not props:
            props = [{"name": "id", "alias": "id", "type": "STRING"}]
        keys = [k for k in c.get("key", []) if k in seen] or [props[0]["name"]]
        node_types.append({
            "name": c["id"], "alias": c["id"], "displayName": c["label"],
            "description": c.get("description", ""), "labels": [c["id"]],
            "properties": props, "primaryKeyProperties": keys,
        })
    names = {n["name"] for n in node_types}
    edge_types, used = [], set()
    for r in ont["relationships"]:
        if r["from"] in names and r["to"] in names:
            en = f'{r["from"]}_{r["label"]}_{r["to"]}'
            if en in used:
                continue
            used.add(en)
            edge_types.append({
                "name": en, "alias": en, "displayName": r["label"], "labels": [r["label"]],
                "sourceNodeType": {"name": r["from"], "alias": r["from"]},
                "destinationNodeType": {"name": r["to"], "alias": r["to"]},
            })
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/graphInstance/definition/graphType/1.0.0/schema.json",
        "nodeTypes": node_types, "edgeTypes": edge_types,
    }


def _b64(obj: dict) -> str:
    return base64.b64encode(json.dumps(obj).encode()).decode()


def _definition_parts(graph_type: dict, graph_display_name: str) -> list[dict]:
    payloads = {
        "graphType.json": graph_type,
        "dataSources.json": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/graphInstance/definition/dataSources/1.0.0/schema.json", "dataSources": []},
        "graphDefinition.json": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/graphInstance/definition/graphDefinition/1.0.0/schema.json", "nodeTables": [], "edgeTables": []},
        "stylingConfiguration.json": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/graphInstance/definition/stylingConfiguration/1.0.0/schema.json", "modelLayout": {"positions": {}, "styles": {}, "pan": {"x": 0.0, "y": 0.0}, "zoomLevel": 1.0}, "visualFormat": None, "scenario": "Ontology"},
        "graphSettings.json": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/item/graphIndex/definition/graphSettings/1.0.0/schema.json"},
        ".platform": {"$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json", "metadata": {"type": "GraphModel", "displayName": graph_display_name}, "config": {"version": "2.0", "logicalId": "00000000-0000-0000-0000-000000000000"}},
    }
    return [{"path": p, "payload": _b64(o), "payloadType": "InlineBase64"} for p, o in payloads.items()]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--what-if", action="store_true", help="Validate and print without writing.")
    args = parser.parse_args()

    ont = json.loads(ONTOLOGY_FILE.read_text(encoding="utf-8"))
    graph_type = _build_graph_type(ont)
    print(f"Ontology model: {len(graph_type['nodeTypes'])} entity types, {len(graph_type['edgeTypes'])} relationships")
    if args.what_if:
        print("[what-if] no changes written.")
        return

    ws = _workspace_id()
    fab = Fabric(_token())

    # 1. Find or create the ontology item (creating it provisions the GraphModel).
    st, items, _ = fab.call("GET", f"/workspaces/{ws}/items")
    if not isinstance(items, dict):
        sys.exit(f"Failed to list workspace items: {st} {items}")
    graph = next((i for i in items["value"] if i.get("type") == "GraphModel"
                  and i.get("displayName", "").startswith(f"{ITEM_DISPLAY_NAME}_graph")), None)
    if graph is None:
        print(f"Creating ontology item '{ITEM_DISPLAY_NAME}'...")
        st, _, hdr = fab.call("POST", f"/workspaces/{ws}/items", {"displayName": ITEM_DISPLAY_NAME, "type": "Ontology"})
        if st not in (200, 201, 202):
            sys.exit(f"Ontology create failed: {st}")
        state, err = fab.wait(hdr)
        if state != "Succeeded":
            sys.exit(f"Ontology create operation {state}: {err}")
        time.sleep(6)
        _, items, _ = fab.call("GET", f"/workspaces/{ws}/items")
        graph = next(i for i in items["value"] if i.get("type") == "GraphModel"
                     and i.get("displayName", "").startswith(f"{ITEM_DISPLAY_NAME}_graph"))
    gid = graph["id"]
    graph_name = graph["displayName"]
    print(f"GraphModel item: {graph_name} ({gid})")

    # 2. Write the entity types + relationships into the GraphModel definition.
    parts = _definition_parts(graph_type, graph_name)
    st, res, hdr = fab.call("POST", f"/workspaces/{ws}/items/{gid}/updateDefinition", {"definition": {"parts": parts}})
    if st not in (200, 202):
        sys.exit(f"updateDefinition failed: {st} {res}")
    state, err = fab.wait(hdr)
    if state != "Succeeded":
        sys.exit(f"Ontology definition update {state}: {err}")
    print(f"Deployed ontology: {len(graph_type['nodeTypes'])} entity types, {len(graph_type['edgeTypes'])} relationships.")


if __name__ == "__main__":
    main()
