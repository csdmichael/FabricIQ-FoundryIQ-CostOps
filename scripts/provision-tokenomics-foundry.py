"""Provision the Foundry ``Tokenomics`` project and the Tokenomics FinOps Analyst
agent that answers questions via the Fabric Data Agent through the APIM gateway.

Path established:  UI -> FastAPI /chat -> Foundry agent -> APIM -> Fabric Data Agent

Everything is read from ``config/deployment.json`` (``foundry`` + ``apim`` sections)
and the generated identity metadata (``.generated/identity.json``) for the OAuth
client used by the Data Agent MCP connection. No values are hard-coded.

Because the Foundry account and APIM gateway have public network access disabled,
this script must run from inside the private network (the same context as
``scripts/deploy.ps1``). Use ``--what-if`` from anywhere to validate the config and
print the provisioning plan without mutating any cloud resources.

Usage:
    python scripts/provision-tokenomics-foundry.py --what-if
    python scripts/provision-tokenomics-foundry.py            # in-network apply
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path) -> dict:
    with open(path, "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def az(args: list[str]) -> str:
    az_cmd = "az.cmd" if sys.platform.startswith("win") else "az"
    result = subprocess.run([az_cmd, *args], capture_output=True, text=True, shell=sys.platform.startswith("win"))
    if result.returncode != 0:
        raise RuntimeError(f"az {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def resolve_plan(config: dict, identity: dict | None) -> dict:
    foundry = config["foundry"]
    apim = config["apim"]
    azure = config.get("azure", {})

    account = foundry["accountName"]
    project = foundry["tokenomicsProjectName"]
    gateway = str(apim["gatewayUrl"]).rstrip("/")
    mcp_path = str(apim["dataAgentMcpPath"]).strip("/")
    mcp_cfg = foundry.get("dataAgentMcp", {})
    mcp_target = mcp_cfg.get("target") or f"{gateway}/{mcp_path}/mcp"

    data_agent_oauth_client = ""
    key_vault_name = ""
    obo_secret_name = "obo-client-secret"
    if identity:
        for client in identity.get("foundryOAuthClients", []):
            if client.get("kind") == "dataAgent":
                data_agent_oauth_client = client.get("clientId", "")
                break
        key_vault_name = identity.get("keyVaultName", "")
        obo_secret_name = identity.get("oboClientSecretName", obo_secret_name)

    return {
        "subscriptionId": azure.get("subscriptionId", ""),
        "resourceGroup": azure.get("resourceGroup", ""),
        "location": foundry.get("location", azure.get("location", "")),
        "tenantId": config.get("identity", {}).get("resourceTenantId", azure.get("tenantId", "")),
        "account": account,
        "project": project,
        "projectDisplayName": foundry.get("tokenomicsProjectDisplayName", project),
        "projectDescription": foundry.get("tokenomicsProjectDescription", ""),
        "projectEndpoint": f"https://{account}.services.ai.azure.com/api/projects/{project}",
        "modelDeployment": foundry["modelDeployment"],
        "apiVersion": foundry.get("apiVersion", "2025-05-15-preview"),
        "armApiVersion": foundry.get("armApiVersion", "2026-07-15-preview"),
        "agentName": foundry["agentName"],
        "agentDisplayName": foundry.get("agentDisplayName", foundry["agentName"]),
        "instructions": foundry["instructions"],
        "mcpConnectionName": mcp_cfg.get("connectionName", "tokenomics-data-agent-mcp-oauth"),
        "mcpToolLabel": mcp_cfg.get("toolLabel", "fabric_tokenomics_data_agent"),
        "mcpTarget": mcp_target,
        "mcpScopes": mcp_cfg.get("scopes", "openid offline_access"),
        "dataAgentOAuthClientId": data_agent_oauth_client,
        "keyVaultName": key_vault_name,
        "oboClientSecretName": obo_secret_name,
    }


def az_rest_put(resource_id: str, api_version: str, body: dict) -> str:
    az_cmd = "az.cmd" if sys.platform.startswith("win") else "az"
    url = f"https://management.azure.com{resource_id}?api-version={api_version}"
    result = subprocess.run(
        [az_cmd, "rest", "--method", "put", "--url", url, "--body", json.dumps(body), "--headers", "Content-Type=application/json"],
        capture_output=True, text=True, shell=sys.platform.startswith("win"),
    )
    if result.returncode != 0:
        raise RuntimeError(f"az rest put {resource_id} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def ensure_project(plan: dict) -> None:
    account_id = (
        f"/subscriptions/{plan['subscriptionId']}/resourceGroups/{plan['resourceGroup']}"
        f"/providers/Microsoft.CognitiveServices/accounts/{plan['account']}"
    )
    existing = az([
        "resource", "list",
        "--resource-type", "Microsoft.CognitiveServices/accounts/projects",
        "--query", f"[?name=='{plan['account']}/{plan['project']}'].id",
        "-o", "tsv",
    ])
    if existing:
        print(f"Project already exists: {plan['account']}/{plan['project']}")
        return
    print(f"Creating Foundry project {plan['project']} under {plan['account']}...")
    body = {
        "location": plan["location"],
        "identity": {"type": "SystemAssigned"},
        "properties": {"displayName": plan["projectDisplayName"], "description": plan["projectDescription"]},
    }
    az_rest_put(f"{account_id}/projects/{plan['project']}", plan["armApiVersion"], body)
    print("  Project created.")


def get_keyvault_secret(vault_name: str, secret_name: str) -> str:
    az_cmd = "az.cmd" if sys.platform.startswith("win") else "az"
    result = subprocess.run(
        [az_cmd, "keyvault", "secret", "show", "--vault-name", vault_name, "--name", secret_name, "--query", "value", "-o", "tsv"],
        capture_output=True, text=True, shell=sys.platform.startswith("win"),
    )
    if result.returncode != 0:
        raise RuntimeError(f"Unable to read Key Vault secret {vault_name}/{secret_name}: {result.stderr.strip()}")
    return result.stdout.strip()


def ensure_connection(plan: dict) -> None:
    """Create the Data Agent MCP OAuth connection pointing at the APIM gateway.

    Mirrors the proven connection on the existing project: category=RemoteTool,
    authType=OAuth2, metadata.type=custom_MCP. The OAuth client secret is read
    from Key Vault at runtime (requires in-network execution).
    """
    print(f"Ensuring MCP connection '{plan['mcpConnectionName']}' -> {plan['mcpTarget']}")
    project_id = (
        f"/subscriptions/{plan['subscriptionId']}/resourceGroups/{plan['resourceGroup']}"
        f"/providers/Microsoft.CognitiveServices/accounts/{plan['account']}/projects/{plan['project']}"
    )
    tenant = plan["tenantId"]
    secret = get_keyvault_secret(plan["keyVaultName"], plan["oboClientSecretName"])
    body = {
        "properties": {
            "category": "RemoteTool",
            "target": plan["mcpTarget"],
            "authType": "OAuth2",
            "credentials": {
                "clientId": plan["dataAgentOAuthClientId"],
                "clientSecret": secret,
                "authorizationEndpoint": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
                "tokenEndpoint": f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                "scopes": plan["mcpScopes"],
            },
            "metadata": {"type": "custom_MCP"},
        }
    }
    az_rest_put(f"{project_id}/connections/{plan['mcpConnectionName']}", plan["armApiVersion"], body)
    print("  Connection ensured.")


def ensure_agent(plan: dict) -> None:
    from azure.ai.agents import AgentsClient
    from azure.identity import DefaultAzureCredential

    client = AgentsClient(
        endpoint=plan["projectEndpoint"],
        credential=DefaultAzureCredential(exclude_interactive_browser_credential=True),
        api_version=plan["apiVersion"],
    )
    mcp_tool = {
        "type": "mcp",
        "server_label": plan["mcpToolLabel"],
        "server_url": plan["mcpTarget"],
        "require_approval": "never",
    }
    existing_id = None
    for agent in client.list_agents():
        if getattr(agent, "name", None) == plan["agentName"]:
            existing_id = agent.id
            break
    if existing_id:
        print(f"Updating agent {plan['agentName']} ({existing_id})...")
        client.update_agent(
            agent_id=existing_id,
            model=plan["modelDeployment"],
            name=plan["agentName"],
            instructions=plan["instructions"],
            tools=[mcp_tool],
        )
    else:
        print(f"Creating agent {plan['agentName']}...")
        created = client.create_agent(
            model=plan["modelDeployment"],
            name=plan["agentName"],
            instructions=plan["instructions"],
            tools=[mcp_tool],
        )
        print(f"  Agent created: {created.id}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(REPO_ROOT / "config" / "deployment.json"))
    parser.add_argument("--identity", default=str(REPO_ROOT / ".generated" / "identity.json"))
    parser.add_argument("--what-if", action="store_true", help="Validate config and print the plan only")
    args = parser.parse_args()

    config = load_json(Path(args.config))
    identity = load_json(Path(args.identity)) if Path(args.identity).exists() else None
    plan = resolve_plan(config, identity)

    print("=== Tokenomics Foundry provisioning plan ===")
    for key in (
        "account", "project", "projectEndpoint", "modelDeployment", "agentName",
        "mcpConnectionName", "mcpTarget", "dataAgentOAuthClientId", "apiVersion",
    ):
        print(f"  {key}: {plan[key]}")

    if args.what_if:
        missing = [k for k in ("subscriptionId", "resourceGroup", "account", "project", "mcpTarget") if not plan[k]]
        if missing:
            print(f"\nWHAT-IF: config incomplete, missing: {', '.join(missing)}")
            sys.exit(1)
        print("\nWHAT-IF: plan is valid. No cloud resources were modified.")
        return

    ensure_project(plan)
    ensure_connection(plan)
    ensure_agent(plan)
    print("\nTokenomics Foundry agent provisioning complete.")


if __name__ == "__main__":
    main()
