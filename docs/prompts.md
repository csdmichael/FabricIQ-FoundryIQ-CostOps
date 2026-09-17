# Fabric OBO completion prompts

Use these prompts in order to finish the Microsoft Fabric on-behalf-of (OBO) implementation and publish separate Lakehouse and Data Agent experiences in Copilot Studio and Microsoft Foundry.

## Current baseline

Completed:

- The Fabric workspace, Lakehouse, SQL endpoint, Data Agent, semantic model, reports, and dashboards exist in the Caldova tenant.
- The Node.js OBO broker, APIM REST/MCP definitions, Bicep, Terraform, connector generator, Copilot Studio agent sources, and executive-deck skill are in this repository.
- Local validation passes, including eight broker tests, Bicep build/lint, Terraform validation, policy parsing, and deployment safety tests.
- ARM validation succeeds, and the last reviewed previews contained only Create, Ignore, and NoChange operations.

Remaining:

- Refresh the Caldova administrator authentication and complete the formal validation gate in [the deployment plan](../.azure/deployment-plan.md).
- Deploy the broker base, provision Entra identities, upload the package, deploy the broker app, and deploy the APIM APIs/MCP projections.
- Create and test the two Power Platform OAuth custom connectors.
- Bind, test, and publish the two Copilot Studio agents.
- Create, test, evaluate, and publish two Microsoft Foundry prompt agents.
- Capture positive-user, denied-user, OBO, MCP, PowerPoint, and private-network evidence.

## Required boundaries

- Preserve the signed-in user end to end. Never use an application identity as a fallback for Fabric data access.
- Keep the Lakehouse and Data Agent surfaces separate. Each agent receives only its intended tool.
- Treat the "OneLake" experience as the governed Lakehouse surface currently implemented here: visible-table discovery and read-only SQL against the Lakehouse SQL analytics endpoint. Raw OneLake file access is new scope and must not be implied.
- Reuse the existing private `caldova-apim-westus` service and configured VNets. Do not modify unrelated Databricks, Copilot Studio, Foundry, or APIM resources.
- Keep secrets out of source, command output, generated metadata, Terraform state, screenshots, and chat. Write credentials directly to Key Vault or the platform connection store.
- For Foundry, preserve user context with OAuth identity passthrough. Do not substitute `custom-keys`, project managed identity, or agent identity when validating OBO behavior.
- Foundry users must be in the same tenant as the Foundry project for OAuth identity passthrough. Cross-tenant token exchange is not supported by that connection mode.
- Do not publish an agent until its tool returns a permission-trimmed result for an allowed user and fails closed for a denied user.

## Target matrix

| Platform | Agent | APIM surface | Expected tools | User identity |
| --- | --- | --- | --- | --- |
| Copilot Studio | Fabric Parts Shortages Analyst | `/fabric-lakehouse` | `tables`, `query` | OAuth custom connector to `Fabric.Access` |
| Copilot Studio | Fabric Data Agent Analyst | `/fabric-data-agent` | `query` | OAuth custom connector to `Fabric.Access` |
| Microsoft Foundry | Fabric OneLake Analyst | `/fabric-lakehouse-mcp/mcp` | Lakehouse table discovery and read-only query only | Foundry OAuth identity passthrough |
| Microsoft Foundry | Fabric Data Agent Analyst | `/fabric-data-agent-mcp/mcp` | Data Agent query only | Foundry OAuth identity passthrough |

## Remaining TODOs

### 1. Repository and validation

- [ ] Confirm [configuration](../config/deployment.json) contains the intended tenant, subscription, workspace, Lakehouse, Data Agent, Power Platform environment, APIM, VNet, and allowed-user IDs.
- [ ] Run `pwsh scripts/validate.ps1 -DeploymentReady -IncludeParity` from the repository root.
- [ ] Refresh Azure CLI authentication for the Caldova tenant and verify Microsoft Graph `/me` resolves to the configured administrator object ID.
- [ ] Regenerate `-WhatIf` previews with real current identities and reject every unexpected Modify, Delete, Deploy, or unsupported change.
- [ ] Complete the remaining azure-validate workflow steps and change the plan to `Validated` only after all checks pass.

### 2. Azure, Entra, broker, and APIM

- [ ] Deploy `broker-base` and record the dedicated storage account, Key Vault, managed identity, private endpoints, and monitoring outputs.
- [ ] Run the identity provisioner idempotently. Store the OBO client credential directly in Key Vault and retain only nonsecret IDs in `.generated/identity.json`.
- [ ] Build and upload the broker package, verifying that temporary storage firewall access is removed and the exact prior network state is restored.
- [ ] Deploy `broker-app`, then verify the Function app uses the user-assigned identity, Key Vault reference, managed-identity storage, VNet integration, private endpoint, and denied public/SCM access.
- [ ] Regenerate the APIM preview with real client IDs and deploy the two REST APIs plus two MCP projections.
- [ ] Verify APIM named values, JWT policy, managed-identity call to the broker, rate limit, timeout, product links, diagnostics, private DNS, and backend reachability.

### 3. Copilot Studio publication

- [ ] Run `pwsh scripts/create-connectors.ps1` after identity provisioning and verify both OAuth connectors in the configured Power Platform environment.
- [ ] Add each generated redirect URI to the matching connector app registration.
- [ ] Confirm both connectors request the full `api://<resource-api-client-id>/Fabric.Access` delegated scope and use end-user credentials.
- [ ] Create a connection as the allowed user and test the Lakehouse `tables`/`query` operations and the Data Agent `query` operation.
- [ ] Run `pwsh scripts/package-agents.ps1`; inspect package evidence before import. The script intentionally does not import or publish.
- [ ] Import or create the two baseline agents in `Caldova Private`.
- [ ] Bind only the Lakehouse connector to the Lakehouse agent and only the Data Agent connector to the Data Agent agent.
- [ ] Add the matching executive PowerPoint prompt with code interpreter, using the checked-in skill instructions.
- [ ] Publish both agents, then pull/clone the live definitions with PAC CLI so actions, prompts, and connection references become source-controlled artifacts.

### 4. Microsoft Foundry publication

- [ ] Select an existing Foundry project and model deployment, or explicitly approve creation. Record the project endpoint and ARM ID outside source-controlled secrets.
- [ ] Verify the Foundry project and all consuming users are in the Caldova tenant.
- [ ] Prove the Foundry tool runtime can resolve and reach the private APIM gateway. Do not weaken APIM public access as a shortcut.
- [ ] Create dedicated Foundry OAuth client registrations for the Lakehouse and Data Agent MCP connections, unless reuse of the corresponding connector clients is explicitly reviewed and approved.
- [ ] Configure custom OAuth with the resource API scope `api://<resource-api-client-id>/Fabric.Access offline_access`, add Foundry-generated redirect URLs, and add the resulting client IDs to the APIM connector allowlist.
- [ ] Create two remote-tool project connections, one per APIM MCP endpoint, with `oauth2` authentication.
- [ ] Fetch the current prompt-agent schema, then create or update two prompt agents with separate names, instructions, tools, and versions.
- [ ] Restrict each agent to its own MCP connection and expected tools. Do not expose both data surfaces to either agent.
- [ ] Add code interpreter only for presentation generation and verify downloadable `.pptx` output.
- [ ] Invoke each agent as an allowed user, surface and complete the OAuth consent request, then rerun the same conversation to verify tool execution.
- [ ] Generate an evaluation suite after deployment and run it only after the dataset and evaluators are reviewed.

### 5. Acceptance and evidence

- [ ] Allowed user: list visible Lakehouse tables and run one read-only query through both Copilot Studio and Foundry Lakehouse agents.
- [ ] Allowed user: ask the same business question through both Data Agent agents and compare evidence/qualifications.
- [ ] Denied user: verify all four agents fail closed with no downstream data.
- [ ] Negative tokens: verify wrong tenant, audience, scope, client application, role, and application-only tokens fail.
- [ ] MCP: verify initialize, tools/list, and tools/call expose only the intended tools for each endpoint.
- [ ] Presentation: generate one executive deck from each data path and verify ZIP signature, `ppt/presentation.xml`, source notes, and no invented values.
- [ ] Observability: correlate APIM, Function, and agent traces without logging tokens, prompts, response bodies, or private result rows.
- [ ] Add sanitized screenshots and final endpoint/agent links to [the main README](../README.md).

## Execution prompts

### Prompt 1: finish and deploy the OBO foundation

```text
Work from the root of the FabricIQ-FoundryIQ-CostOps repository. Resume the Fabric OBO deployment from .azure/deployment-plan.md and config/deployment.json. Reauthenticate to the configured Caldova tenant, rerun deployment-ready validation and fresh ARM what-if, and stop on any unexpected modification or deletion. If validation passes, deploy broker-base, provision the Entra applications and principal-scoped consent idempotently, store the OBO secret directly in Key Vault, build/upload the broker package, deploy broker-app, and deploy the APIM REST/MCP surfaces. Preserve the private APIM posture and existing shared resources. Never print or persist secrets. Verify live RBAC, private DNS, Function health, APIM-to-broker reachability, and all negative token cases. Record nonsecret evidence in the deployment plan and README.
```

### Prompt 2: publish the Copilot Studio Lakehouse agent

```text
Publish the Fabric Parts Shortages Analyst in the configured Caldova Private Power Platform environment. Use the generated Lakehouse OAuth custom connector through APIM, not direct Fabric access and not maker credentials. Bind only the tables and read-only query operations. Preserve per-user OBO with the Fabric.Access delegated scope. Add the Create Fabric Lakehouse Executive PowerPoint prompt with code interpreter and the executive-deck-builder instructions. Test with the allowed user and a denied user, generate and validate a real PPTX, publish only after all checks pass, then pull the live agent so connector actions, prompt, and connection references are captured in source.
```

### Prompt 3: publish the Copilot Studio Data Agent agent

```text
Publish the Fabric Data Agent Analyst in the configured Caldova Private Power Platform environment. Use only the generated Data Agent OAuth custom connector through APIM and preserve per-user OBO with the Fabric.Access delegated scope. Bind only the Data Agent query action. Add the Create Fabric Data Agent Executive PowerPoint prompt with code interpreter and the executive-deck-builder instructions. Test evidence preservation, allowed-user access, denied-user failure, and PPTX generation. Publish only after all checks pass, then pull the live agent so its action, prompt, and connection reference are source controlled.
```

### Prompt 4: publish the Microsoft Foundry Lakehouse agent

```text
Create or update a Microsoft Foundry prompt agent named Fabric OneLake Analyst in an explicitly selected Caldova Foundry project. Use only the APIM Lakehouse MCP endpoint /fabric-lakehouse-mcp/mcp. Configure a dedicated remote-tool project connection with OAuth identity passthrough to the Fabric OBO resource API, including offline_access, and register the generated redirect URI. Ensure the OAuth client ID is in the APIM allowed-client list. Do not use API-key, project-managed-identity, agent-identity, or application-only fallback. Restrict tools to visible-table discovery and read-only query. Add code interpreter for executive PPTX generation. Prove private APIM reachability, complete user consent, smoke-test allowed and denied users, create an evaluation suite, and record the agent version and Playground link.
```

### Prompt 5: publish the Microsoft Foundry Data Agent agent

```text
Create or update a Microsoft Foundry prompt agent named Fabric Data Agent Analyst in the same explicitly selected Caldova Foundry project. Use only the APIM Data Agent MCP endpoint /fabric-data-agent-mcp/mcp. Configure a separate OAuth identity-passthrough connection to the Fabric OBO resource API, including offline_access, register its redirect URI, and allow its client ID in APIM. Expose only the Data Agent query tool. Preserve the response's evidence and qualifications, add code interpreter for executive PPTX generation, and prohibit application-identity fallback. Prove private APIM reachability, complete user consent, test allowed and denied users, create an evaluation suite, and record the agent version and Playground link.
```

### Prompt 6: run cross-platform acceptance

```text
Run the complete Fabric OBO acceptance matrix across Copilot Studio and Microsoft Foundry. Test the Lakehouse and Data Agent paths separately through APIM. For each platform and path, capture tool discovery, allowed-user success, denied-user failure, wrong-token failures, evidence fidelity, and executive PPTX output. Correlate APIM and Function telemetry without exposing sensitive content. Compare results across platforms, list any behavioral differences, update README links and sanitized screenshots, and leave deployment-plan checkboxes unchecked for any result that was not directly observed.
```

## References

- [Configure OBO authentication for Copilot Studio custom connectors](https://learn.microsoft.com/microsoft-copilot-studio/advanced-custom-connector-on-behalf-of)
- [Use Power Platform connectors as Copilot Studio tools](https://learn.microsoft.com/microsoft-copilot-studio/advanced-connectors)
- [Set up MCP authentication in Microsoft Foundry](https://learn.microsoft.com/azure/foundry/agents/how-to/mcp-authentication)
- [How toolbox authentication works in Microsoft Foundry](https://learn.microsoft.com/azure/foundry/agents/how-to/tools/tool-authentication)
