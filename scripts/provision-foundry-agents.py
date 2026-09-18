import argparse
import json
import time
from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import MCPTool, PromptAgentDefinition
from azure.identity import AzureCliCredential


def retryable(error: Exception) -> bool:
    status = getattr(error, "status_code", None)
    return status in {404, 408, 409, 424, 429, 500, 502, 503, 504} or any(
        marker in str(error).lower() for marker in ("404", "not found", "not ready", "temporarily unavailable")
    )


def create_agent(project: AIProjectClient, name: str, definition: PromptAgentDefinition):
    for attempt in range(6):
        try:
            return project.agents.create_version(agent_name=name, definition=definition)
        except Exception as error:
            if attempt == 5 or not retryable(error):
                raise
            time.sleep(5)
    raise RuntimeError("agent_create_retry_exhausted")


def smoke_test(project: AIProjectClient, agent_name: str) -> None:
    for attempt in range(6):
        try:
            with project.get_openai_client(agent_name=agent_name) as openai:
                conversation = openai.conversations.create()
                response = openai.responses.create(
                    conversation=conversation.id,
                    input="Reply with exactly READY. Do not call tools.",
                )
                if response.output_text.strip().upper() != "READY":
                    raise RuntimeError("unexpected_smoke_response")
                return
        except Exception as error:
            if attempt == 5 or not retryable(error):
                raise
            time.sleep(5)
    raise RuntimeError("agent_smoke_retry_exhausted")


def write_checkpoint(
    output_path: Path,
    project_endpoint: str,
    foundry: dict,
    agents: list[dict],
    status: str,
) -> None:
    output = {
        "schemaVersion": 1,
        "status": status,
        "projectEndpoint": project_endpoint,
        "accountName": foundry["accountName"],
        "projectName": foundry["projectName"],
        "agents": agents,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--connections", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--skip-smoke-test", action="store_true")
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    root = config_path.parent.parent
    config = json.loads(config_path.read_text(encoding="utf-8-sig"))
    connection_metadata = json.loads(Path(args.connections).read_text(encoding="utf-8-sig"))
    connection_by_kind = {item["kind"]: item for item in connection_metadata["connections"]}
    foundry = config["foundry"]
    project_endpoint = f"https://{foundry['accountName']}.services.ai.azure.com/api/projects/{foundry['projectName']}"
    output_path = Path(args.output).resolve()

    definitions = [
        {
            "kind": "lakehouse",
            "name": foundry["agents"]["lakehouse"],
            "model": f"{foundry['modelConnections']['lakehouse']}/{foundry['model']['name']}",
            "instructions": root / "agents" / "foundry" / "lakehouse-instructions.md",
        },
        {
            "kind": "dataAgent",
            "name": foundry["agents"]["dataAgent"],
            "model": f"{foundry['modelConnections']['dataAgent']}/{foundry['model']['name']}",
            "instructions": root / "agents" / "foundry" / "data-agent-instructions.md",
        },
    ]

    results = []
    write_checkpoint(output_path, project_endpoint, foundry, results, "in-progress")
    with AzureCliCredential(tenant_id=config["azure"]["tenantId"]) as credential, AIProjectClient(
        endpoint=project_endpoint,
        credential=credential,
    ) as project:
        for item in definitions:
            mcp = foundry["mcpConnections"][item["kind"]]
            connection = connection_by_kind[item["kind"]]
            tool = MCPTool(
                server_label=mcp["serverLabel"],
                server_url=f"{config['apim']['gatewayUrl']}/{mcp['apiPath']}",
                project_connection_id=connection["id"],
                allowed_tools=mcp["allowedTools"],
                require_approval="never",
            )
            agent = create_agent(
                project,
                item["name"],
                PromptAgentDefinition(
                    model=item["model"],
                    instructions=item["instructions"].read_text(encoding="utf-8"),
                    tools=[tool],
                ),
            )
            result = {
                "kind": item["kind"],
                "id": agent.id,
                "name": agent.name,
                "version": agent.version,
                "model": item["model"],
                "mcpConnectionId": connection["id"],
                "smokeTest": "pending",
            }
            results.append(result)
            write_checkpoint(output_path, project_endpoint, foundry, results, "in-progress")
            if not args.skip_smoke_test:
                smoke_test(project, agent.name)
            result["smokeTest"] = "skipped" if args.skip_smoke_test else "passed"
            write_checkpoint(output_path, project_endpoint, foundry, results, "in-progress")

    write_checkpoint(output_path, project_endpoint, foundry, results, "ready")


if __name__ == "__main__":
    main()