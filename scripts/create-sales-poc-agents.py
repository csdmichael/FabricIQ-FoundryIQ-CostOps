import json
import os
import sys
from azure.identity import AzureCliCredential
from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import MCPTool, PromptAgentDefinition

from foundry_knowledge import build_foundry_iq_capabilities, ensure_foundry_iq_connection

project_endpoint = "https://foundry-myaacoub-private.services.ai.azure.com/api/projects/sales-poc"
project_resource_id = "/subscriptions/cf824570-a8ba-497a-a184-0a52f1830aa9/resourceGroups/m365-myaacoub/providers/Microsoft.CognitiveServices/accounts/foundry-myaacoub-private/projects/sales-poc"
tenant_id = "12a4b86b-e64c-43f9-af05-d9130a72dfd2"
search_endpoint = "https://semiconductor-search-myaacoub.search.windows.net"
knowledge_base_name = "parts-shortages-lakehouse-kb"
knowledge_connection_name = "parts-shortages-lakehouse-kb"

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

with open(os.path.join(repo_root, '.generated', 'sales-poc-oauth-connections.json'), 'r', encoding='utf-8') as f:
    conn_map = json.load(f)

data_agent_conn_id = conn_map['fabric-data-agent-mcp-oauth']['id']

lakehouse_instr = open(os.path.join(repo_root, 'agents', 'foundry', 'lakehouse-instructions.md'), encoding='utf-8').read()
data_agent_instr = open(os.path.join(repo_root, 'agents', 'foundry', 'data-agent-instructions.md'), encoding='utf-8').read()

model_deployment_name = "gpt-5.6-sol"

print(f"Connecting to AIProjectClient at {project_endpoint}...")

with AzureCliCredential(tenant_id=tenant_id) as credential:
    project = AIProjectClient(endpoint=project_endpoint, credential=credential)

    # 1. Lakehouse Agent
    print("Creating/Updating Agent 1: Fabric Lakehouse Analyst...")
    knowledge_connection = ensure_foundry_iq_connection(
        credential=credential,
        project_resource_id=project_resource_id,
        connection_name=knowledge_connection_name,
        search_endpoint=search_endpoint,
        knowledge_base_name=knowledge_base_name,
    )
    lakehouse_capability_tools, lakehouse_knowledge = build_foundry_iq_capabilities(
        connection_id=knowledge_connection["id"],
        search_endpoint=search_endpoint,
        knowledge_base_name=knowledge_base_name,
    )

    lakehouse_agent = project.agents.create_version(
        agent_name="fabric-lakehouse-analyst-obo",
        definition=PromptAgentDefinition(
            model=model_deployment_name,
            instructions=lakehouse_instr,
            tools=lakehouse_capability_tools
        )
    )
    print(f"Successfully created Lakehouse Agent: {lakehouse_agent.name} (version {lakehouse_agent.version}, ID: {lakehouse_agent.id})")

    # 2. Data Agent Agent
    print("Creating/Updating Agent 2: Fabric Data Agent Analyst...")
    data_agent_tool = MCPTool(
        server_label="fabric_data_agent_mcp",
        server_url="https://caldova-apim-westus.azure-api.net/fabric-data-agent-mcp/mcp",
        project_connection_id=data_agent_conn_id,
        allowed_tools=["query"],
        require_approval="never"
    )

    data_agent_agent = project.agents.create_version(
        agent_name="fabric-data-agent-analyst-obo",
        definition=PromptAgentDefinition(
            model=model_deployment_name,
            instructions=data_agent_instr,
            tools=[data_agent_tool]
        )
    )
    print(f"Successfully created Data Agent Agent: {data_agent_agent.name} (version {data_agent_agent.version}, ID: {data_agent_agent.id})")

    out_info = {
        "projectEndpoint": project_endpoint,
        "agents": [
            {
                "name": lakehouse_agent.name,
                "version": lakehouse_agent.version,
                "id": lakehouse_agent.id,
                "knowledgeConnectionId": knowledge_connection["id"],
                "tools": ["foundry_iq_knowledge", "code_interpreter"],
                "knowledgeSource": lakehouse_knowledge
            },
            {
                "name": data_agent_agent.name,
                "version": data_agent_agent.version,
                "id": data_agent_agent.id,
                "mcpServer": "https://caldova-apim-westus.azure-api.net/fabric-data-agent-mcp/mcp",
                "mcpConnectionId": data_agent_conn_id,
                "tools": ["mcp"],
                "knowledgeSource": None
            }
        ]
    }

    out_file = os.path.join(repo_root, '.generated', 'sales-poc-agents.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(out_info, f, indent=2)
    print(f"Saved agent details to {out_file}")
