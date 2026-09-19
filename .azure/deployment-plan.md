# Fabric Lakehouse and Data Agent OBO

Status: Validated

## Active Scope

Build, publish, and deploy a customer-portable Microsoft Fabric integration that:

- exposes a Fabric Lakehouse query API and MCP server through Azure API Management;
- proxies the published Fabric data-agent MCP server through APIM;
- preserves the signed-in user with the OAuth 2.0 on-behalf-of flow;
- packages two Copilot Studio agents with the high-fidelity PowerPoint skill;
- uses one nonsecret JSON configuration contract across PowerShell, Bicep, and Terraform;
- supplies separate `bicep` and `terraform` deployment paths;
- supplies Terraform parity for the repository's existing Bicep deployment surfaces;
- deploys a dedicated VNet-injected private Microsoft Foundry account and project;
- routes `gpt-5.6-sol` model calls through two attributable APIM AI Gateway APIs;
- publishes a `fabric` APIM product for Fabric REST/MCP/tokenomics and a separate `foundry` product for model inference;
- creates two Prompt Agents with separate custom OAuth MCP connections and least-privilege tool allowlists;
- reconciles token telemetry with resource-group-scoped Azure Cost Management `ActualCost`;
- publishes the live-only Angular/Ionic dashboard to a Windows Web App with a same-origin private-APIM proxy;
- documents the complete identity and network flow with sanitized live screenshots; and
- commits and pushes source before publishing and deploying cloud resources.

The user approved implementation, commit, publication, and deployment in the requests
dated 2026-09-16. No secret, access token, connector credential, or private key may be
written to source, Terraform state examples, logs, screenshots, or documentation.

## Active Target

- Tenant: `12a4b86b-e64c-43f9-af05-d9130a72dfd2`
- Subscription: `cf824570-a8ba-497a-a184-0a52f1830aa9`
- Resource group: `m365-myaacoub`
- Azure region: `westus2` (the existing APIM service remains in `westus`)
- Fabric capacity: `caldovafabricmyaacoub`
	(`37fcefa2-236a-47c0-a528-2c80137dfec0`, West US 2)
- Fabric workspace: `Fabric IQ Parts Shortages`
	(`53829079-597d-4c27-9897-6a2042473761`, West US 2)
- Lakehouse: `lh_part_shortages_v2`
	(`a757a457-6402-4c2a-bf5e-1f80d55f68e8`)
- SQL analytics endpoint: `0e30ee4b-25af-47ee-b783-90681caad6d8`
- Published data agent: `agent_part_shortages`
	(`25696ea2-a91e-4b18-9846-5d045c6a082e`)
- Power BI semantic model: `sm_part_shortages`
	(`18be2ce1-3566-437d-971d-c4532e2e3575`)
- Existing APIM service: `caldova-apim-westus`
- Copilot Studio environment: `Caldova Private`
	(`52456fcd-1d20-ecdb-aa2e-8979e3f794f5`, Canada, Managed Environment with Dataverse)

## Architecture Decisions

1. Fabric is a multitenant service and has no customer VNet to peer. This single-tenant
	 deployment reuses the existing customer-owned APIM and broker VNets and their existing
	 peering. It does not create a Fabric workspace-level Private Link service.
2. The current workspace contains Power BI semantic models. Microsoft documents those
	 as incompatible with workspace-level Private Link. The deployment must preflight and
	 stop before creating or restricting the workspace private link; it must not delete,
	 move, or alter those semantic models automatically.
3. The Lakehouse API uses a small protocol adapter because APIM cannot issue TDS queries
	 directly. APIM validates the connector's delegated API token, authenticates to the
	 broker with its managed identity, and forwards the original assertion separately.
	 The broker performs confidential OBO for the fixed Fabric or Power BI scope. The
	 adapter allows read-only SQL and uses the Lakehouse SQL analytics endpoint under the
	 signed-in user's Fabric permissions.
4. The Lakehouse MCP surface is generated from the governed Lakehouse REST operations
	 in APIM. The Fabric data-agent surface remains native streamable HTTP MCP and is
	 proxied through APIM after the same delegated OBO exchange. Its upstream endpoint is
	 `https://api.fabric.microsoft.com/v1/mcp/workspaces/{workspaceId}/dataagents/{dataAgentId}/agent`.
5. Bicep is the live deployment recipe for this reference tenant. Terraform is an
	 equivalent customer option and is validated independently, but both tools must never
	 manage the same deployed resource at the same time.
6. Entra applications and Power Platform connectors are provisioned in the Caldova tenant
	 by idempotent PowerShell because they are tenant objects, not Azure resource-group
	 resources. Credentials are generated only in memory and passed directly to Key Vault
	 or the target service.
7. Copilot Studio agents are solution/package artifacts driven from configuration. A
	 deployment must stop if the configured environment is absent, lacks Dataverse, or
	 cannot support the selected private-network path.
8. The dedicated `foundry-fabric-costops/fabric-costops` project uses a new exclusive
	`foundry-costops-agent` subnet. The existing `foundry-agent` subnet remains owned by
	`foundry-myaacoub-private` and must not be reused.
9. The model backend remains private. APIM uses outbound VNet integration and managed
	identity to reach it; the project uses two `ApiManagement` connections so model tokens
	are attributed to the Lakehouse or Data Agent Prompt Agent by API ID.
10. Azure-billed `ActualCost` is distinct from market and negotiated rate-card estimates.
	Dedicated model cost is allocated by observed token share; shared APIM/App Service cost
	and untracked resource-group cost remain separately disclosed.

## Execution Plan

- [x] Reconcile and validate the five resumed Terraform modules without discarding user edits.
- [x] Add Terraform parity for every remaining existing Bicep deployment folder.
- [x] Implement and test the Fabric OBO adapter and APIM REST/MCP policies.
- [x] Add config-driven Fabric Bicep and Terraform stacks with matching outputs.
- [x] Add idempotent Entra, connector, MCP, and Copilot Studio packaging scripts.
- [x] Copy and generalize the executive PowerPoint skill for Fabric sources.
- [x] Write `README.md` with architecture, OBO, deployment, acceptance, and rollback guidance.
- [x] Copy the Lakehouse, SQL endpoint, Data Agent, and OneLake data into the Caldova workspace.
- [x] Publish and verify the Caldova semantic model, three reports, and two dashboards.
- [x] Run syntax, unit, policy, Bicep, Terraform, secret, and local parity checks.
- [x] Implement private Foundry, APIM model gateway, OAuth Prompt Agents, ActualCost, and production UI hosting.
- [x] Validate the selected `gpt-5.6-sol` version/SKU and available westus quota.
- [x] Validate the live Cost Management `ActualCost` response schema at resource-group scope.
- [x] Re-run Azure validation and what-if for the single-tenant Caldova target; record proof below.
- [x] Commit and push source.
- [x] Deploy Azure resources and application code through the validated Bicep recipe.
- [ ] Publish connectors and both agents only after the target environment resolves.
- [x] Run delegated-user, denial, MCP handshake, Lakehouse query, and Data Agent query tests.
- [ ] Run deck-generation tests.
- [ ] Capture sanitized screenshots and publish them in the Fabric README.

## Deployment Gates

- Do not enable workspace inbound restriction while unsupported semantic models remain.
- Do not create a replacement Power Platform environment without explicit environment
	region, type, Dataverse, licensing, and irreversible-provisioning approval.
- Do not repurpose an existing APIM, VNet, subnet, app registration, or App Service until
	its configuration and ownership are verified.
- Do not deploy old Databricks parity modules into the active Fabric tenant; they are
	customer alternatives for the existing Bicep modules only.
- Do not publish an agent until its OAuth connection is created by an authorized user and
	its tool returns a live permission-trimmed result.

## Active Validation Proof

2026-09-18 live deployment and acceptance (current):

- Source commits `458424b` and `5ef5dec` were pushed to `origin/main` before their
	corresponding cloud mutations. The recovery suite passed 21 broker tests, two UI tests,
	all Bicep/Terraform roots, APIM policy/OpenAPI parsing, packaging, and safety checks.
- The private Foundry account/project, `gpt-5.6-sol` deployment, delegated `/24` agent
	subnet, private endpoint/DNS, broker Function, production UI, APIM APIs/products, and two
	Foundry AI-gateway connections all reached `Succeeded`. UI `/health` returns `{"status":"ok"}`.
- Live APIM inventory confirms five Fabric REST/inference APIs plus two `type=mcp` APIs.
	The published `fabric` product has five links (Lakehouse/Data Agent REST, both MCP APIs,
	and tokenomics); `foundry` has both inference links. Lakehouse MCP exposes `tables` and
	`query`; Data Agent MCP exposes `query`.
- Foundry Prompt Agents `fabric-lakehouse-costops:1` and `fabric-data-agent-costops:1`
	use separate APIM model connections and separate OAuth MCP connections. The configured
	administrator completed user OAuth consent for both connections.
- In-VNet acceptance passed private DNS, anonymous REST denial (`401`), denied
	unauthenticated MCP tool calls, Lakehouse `tables`, a bounded read-only SQL `query` against
	`INFORMATION_SCHEMA.TABLES`, and a live Fabric Data Agent `query`. Both agents completed
	their expected MCP calls and returned final response text; no business rows were retained
	in validation artifacts.
- Final network posture: APIM, Foundry, Key Vault, Storage, and the broker Function retain
	public access disabled; Key Vault, Storage, and Foundry contain zero temporary IP rules.
	The temporary VM Blob/Foundry roles were deleted and the private runner was deallocated.
- OBO secret creation now uses the write-only ARM `Microsoft.KeyVault/vaults/secrets`
	resource, so identity provisioning never opens public Key Vault access. Broker package
	upload was performed over the Blob private endpoint by an in-VNet managed identity.

2026-09-18 resumed deployment validation (current):

- `pwsh scripts/validate.ps1 -DeploymentReady -IncludeParity` passed the configuration
	contract, 21 broker tests, two Angular tests, both production builds, zero production
	dependency vulnerabilities, APIM OpenAPI/policy parsing, six Bicep targets, all
	Terraform parity roots, PowerShell and Python syntax, portable packaging, and deployment
	safety checks.
- Live inventory of `caldova-apim-westus` found only the three pre-existing Databricks APIs
	and the `databricks-agents` product. None of this deployment's Fabric APIs, MCP APIs,
	tokenomics API, Foundry routes, or `fabric`/`foundry` products exists yet.
- Fresh guarded ARM previews from the current source and generated parameters completed
	without deletes or unsupported changes: broker base `Create=3, Ignore=87, Modify=11,
	NoChange=14`; private Foundry base `Create=9, Ignore=101`; broker application `Create=9,
	Ignore=87, Modify=11, NoChange=14`; APIM APIs/products/policies `Create=52`; production
	UI `Create=5, Ignore=101`; Foundry APIM connections `Create=2, Ignore=101`.
- The APIM preview is additive-only on the shared service. It creates the Lakehouse and
	Data Agent REST APIs, their two APIM MCP APIs, tokenomics, two Foundry inference APIs,
	the published `fabric` and `foundry` products, their API links, named values, policies,
	logger, and dedicated diagnostic setting. It proposes zero modifications or deletions.
- The 11 broker modifications are the same previously reviewed Azure read-model deltas on
	deployment-owned role assignments, private endpoints and zone groups, and Application
	Insights metadata. The resumed preview introduces no shared-resource modification.
- Static RBAC parity was rechecked across Bicep and Terraform. Storage and Key Vault
	data-plane roles remain resource-scoped, Log Analytics Reader remains workspace-scoped,
	APIM receives Cognitive Services User only on the new Foundry account, and the only
	resource-group exception is the three read-only roles required by the configured
	resource-group-scoped `ActualCost` query.

2026-09-17 private Foundry, AI Gateway, ActualCost, and production UI validation (current):

- Formal Bicep recipe validation completed at `2026-09-17T23:40:40Z` with
	`references/recipes/scripts/validate-deployment.ps1`. Every invocation passed Azure CLI,
	authentication, Bicep compilation, target-scope ARM validation, and what-if:
	- broker base: resource-group scope, `OVERALL: PASS`;
	- private Foundry foundation: `Create=10, Modify=0, Delete=0`, `OVERALL: PASS`;
	- broker application: resource-group scope, `OVERALL: PASS`;
	- APIM APIs/products/policies: `Create=54, Modify=0, Delete=0`, `OVERALL: PASS`;
	- production UI: `Create=6, Modify=0, Delete=0`, `OVERALL: PASS`;
	- Foundry APIM model connections: `Create=3, Modify=0, Delete=0`, `OVERALL: PASS`.
- The recipe helper counts nested pretty-print property lines for the already-deployed broker
	resources and reports 16 apparent deletes. The retained `FullResourcePayloads` previews are
	authoritative: they contain zero resource deletions. All 11 broker resource modifications
	remain the reviewed Azure read-model/symbolic-reference deltas documented below.
- Azure Policy validation retrieved nine enforced assignments effective at
	`m365-myaacoub`. The region rule blocks only West Europe; planned resources use West US
	or West US 2. Resource-type rules target classic Azure types, VM/VMSS/AKS, Sentinel,
	SQL, and Managed HSM. The only Cognitive Services deny blocks
	`ProvisionedManaged`; the selected `gpt-5.6-sol` deployment uses `GlobalStandard`.
	All target-scope ARM validation and what-if commands passed policy evaluation.

- `pwsh scripts/validate.ps1 -DeploymentReady -IncludeParity` completed again at
	`2026-09-17T23:47:44Z` and passed the configuration contract, 15 broker tests, two Angular tests, both production
	builds, zero production dependency vulnerabilities, APIM OpenAPI/policy parsing, six
	Bicep build/lint targets, all Terraform parity roots, PowerShell/Python/Node syntax,
	portable ZIP, and deployment safety tests.
- West US model discovery confirmed `gpt-5.6-sol` version `2026-07-09` supports
	`GlobalStandard`. Subscription quota reported 500 of 1000 used; the configured 50-unit
	deployment fits the remaining quota. `gpt-6-astra` GlobalStandard had no remaining quota
	and is not selected.
- The existing APIM is Standard v2 with outbound VNet integration and an approved private
	gateway endpoint. Its `publicNetworkAccess` remains `Disabled`. The broker VNet is peered
	to the APIM VNet and linked to `privatelink.azure-api.net`, enabling the production UI's
	same-origin server proxy without exposing APIM publicly.
- Isolated what-if previews: private Foundry `Create=9, Ignore=100`; APIM APIs, products, and policies
	`Create=53`; production UI `Create=5, Ignore=100`; Windows broker app
	`Create=9, Ignore=86, Modify=11, NoChange=14`. Foundry and UI previews contain zero
	Modify/Delete/Unsupported changes and ignore the unrelated existing Foundry account.
- The 11 broker modifications were reviewed field by field: Azure-managed App Insights
	metadata, symbolic references resolving to the unchanged UAMI principal, read-only
	private-endpoint IPv6 response fields, and private DNS child response metadata only.
	The three new broker role assignments are Cost Management Reader, Monitoring Reader,
	and Reader scoped only to `m365-myaacoub`.
- A live seven-day `ActualCost` query at the configured resource-group scope returned
	columns `Cost, UsageDate, ResourceId, ServiceName, Currency`, 244 rows, no next page,
	and total scope cost `275.55526 USD`. This validates the production parser contract but
	does not claim that costs for not-yet-created Foundry/UI resources already exist.
- APIM product ownership is split explicitly: `fabric` links the Lakehouse/Data Agent
	REST and MCP APIs plus tokenomics; `foundry` links only the two model-inference APIs.
- The dedicated Foundry account/project, OAuth connections, Prompt Agent versions, and UI
	host are not yet deployed. The official azure-validate workflow is recording this proof
	before authorizing the `Validated` status for the expanded scope.

2026-09-17 tokenomics and responsive UI validation (current):

- `pwsh scripts/validate.ps1 -DeploymentReady -IncludeParity -SkipTerraformInit`
	passed the configuration contract, broker build and tests, UI production build and
	Vitest tests, production dependency audits, APIM OpenAPI/policy parsing, Bicep build
	and lint, all Terraform parity modules, PowerShell syntax, portable ZIP, fail-closed
	what-if, and agent-package safety tests. Broker and UI production dependencies reported
	zero known vulnerabilities. After the shared-workspace isolation correction,
	`npm test --prefix functions/obo-broker` passed all 11 tests.
- Angular 21, Ionic 7 LTS, MSAL browser, and Chart.js build successfully. Playwright
	verified web (1440x1000), tablet (1024x900), and phone (390x844) layouts with the
	expected sidebar/icon-rail/bottom-tab navigation, zero horizontal overflow, no tested
	text overflow, nonblank chart canvases, and working phone view switching. The checked-in
	runtime configuration is explicitly unconfigured and contains no demo data; a live build
	requires generated SPA identity metadata and never embeds a credential.
- Azure CLI authentication matched tenant `12a4b86b-e64c-43f9-af05-d9130a72dfd2`
	and subscription `cf824570-a8ba-497a-a184-0a52f1830aa9`. Microsoft Graph `/me`
	resolved `admin@caldova37587778.onmicrosoft.com` to configured allowed object ID
	`715bb744-31d0-4f76-ac85-7193bcf5a4eb`.
- Fresh fail-closed previews contain broker base `Create=25, Ignore=83, NoChange=2`,
	broker app `Create=31, Ignore=83, NoChange=2`, and APIM `Create=38`. The first APIM
	preview correctly stopped because it proposed modifying the existing shared
	`diagnostics/azuremonitor` resource and removing query-parameter masking. The template
	was corrected to leave that resource unmanaged; the final APIM preview is additive only.
	All final previews contain zero Modify, Delete, Deploy, Unsupported, or unknown changes.
- Explicit ARM `validate` returned success for broker base, broker app shape, and the
	subscription-scoped APIM stack using the fresh generated parameter files.
- Azure Policy validation resolved three inherited Defender initiatives and all 11
	constituent policies. Every effective action is `DeployIfNotExists`; there are zero
	Deny effects. Static RBAC review confirms the new Log Analytics Reader role is scoped
	only to the dedicated broker workspace and is identical in Bicep and Terraform.
- APIM exports `GatewayLogs`, `GatewayLlmLogs`, and metrics to the dedicated workspace
	through an additive `fabric-tokenomics` diagnostic setting. Dashboard KQL inner-joins
	LLM rows to this repository's configured API correlations, preventing unrelated APIs on
	the shared APIM service from entering allocation results. The live rate card is empty by
	default, so the UI reports usage without claiming cost until negotiated or market rates
	are explicitly configured.
- The first `broker-base` deployment attempt stopped on duplicate private DNS VNet links
	for the shared web and Blob zones. Dedicated base resources and the table/vault links
	were created before ARM reported the conflicts. Recovery now references the existing
	web/Blob links by configured name and validates that each targets the broker VNet with
	registration disabled; Bicep and Terraform manage only the table/vault links.
- The recovery template keeps the dedicated Key Vault at `publicNetworkAccess=Disabled`.
	Identity provisioning writes the in-memory OBO credential through the write-only ARM
	secret child resource and never changes the vault's network ACL or public-access state.
- Recovery what-if contains `Ignore=86, Modify=11, NoChange=14`. Every modification is on
	a deployment-owned resource. Four role-assignment deltas were verified against live UAMI
	principal `c64f65bb-0c99-4409-aa75-4b37777d79c4`; three DNS-zone-group deltas remove only
	read-only ARM `etag`, `id`, `type`, and provisioning-state fields; three private-endpoint
	deltas remove the read-only IPv6 response field; the remaining Application Insights delta
	adds Azure-managed `Flow_Type` and `Request_Source`. There are no deletes or shared-resource
	changes. Full local validation and target-scope ARM validation passed after the recovery.

The 2026-09-16 dual-tenant validation below is retained as historical evidence only. It
does not authorize deployment after the target moved to the single-tenant Caldova
workspace. The active status remains `Approved` until the azure-validate workflow records
fresh local checks, ARM validation, what-if output, and role verification for the current
configuration.

2026-09-17 single-tenant Caldova validation:

- `pwsh scripts/validate.ps1 -DeploymentReady -IncludeParity`: passed after
	making APIM public-network posture config-driven and normalizing Azure location display
	names in preflight. The broker compiled; all 8 tests passed; production dependencies
	reported zero vulnerabilities; OpenAPI and policy XML parsed; Bicep built and linted;
	Fabric and repository-parity Terraform modules formatted and validated; every Fabric
	PowerShell script parsed; all deployment safety tests passed.
- Active Azure CLI context matched Caldova tenant
	`12a4b86b-e64c-43f9-af05-d9130a72dfd2`, subscription
	`cf824570-a8ba-497a-a184-0a52f1830aa9`, and administrator
	`admin@caldova37587778.onmicrosoft.com`.
- Live Fabric and Power BI APIs confirmed the configured Caldova workspace, Lakehouse,
	SQL endpoint, Data Agent, semantic model, three reports, and two dashboards. Azure
	inventory confirmed that the existing private `caldova-apim-westus` service matches
	the configured StandardV2 VNet/subnet and that the new broker resources do not yet exist.
- `pwsh scripts/deploy.ps1 -Step all -WhatIf -CurrentDeployerPrincipalId
	715bb744-31d0-4f76-ac85-7193bcf5a4eb`: passed. Fresh previews contained broker base
	`Create=24, Ignore=83, NoChange=2`; broker app `Create=30, Ignore=83, NoChange=2`;
	APIM APIs/MCP `Create=26`. Every preview contained zero blocked change types and no
	Modify, Delete, Deploy, Unsupported, or unknown change.
- Explicit ARM `validate` returned `Succeeded` for broker base, broker app shape, and the
	subscription-scoped APIM APIs/MCP stack using the freshly generated parameter files.
- Inherited policy review found security/audit/deploy initiatives and deny rules. The only
	resource-type deny list contains legacy `Microsoft.Classic*` types; other denies target
	VM/VMSS/AKS/OpenAI/Sentinel/SQL/managed-HSM cases outside this deployment. The planned
	resource types and West US/West US 2 locations are not blocked.
- Static role verification passed as recorded below. All service data-plane roles are on
	the dedicated storage account or Key Vault; no broad resource-group or subscription role
	is introduced.
- Remaining validation gate: refresh the administrator's Graph token under current
	continuous-access policy and verify `/me` before identity provisioning. The plan remains
	`Approved` until that succeeds and the official azure-validate workflow completes.

2026-09-16 local source validation:

- `pwsh scripts/validate.ps1 -SkipTerraformInit -IncludeParity`: passed.
	The broker compiled; all 8 unit tests passed; production dependency audit reported
	zero vulnerabilities; both OpenAPI documents and all four APIM policies parsed;
	all four Fabric Bicep entry points built and linted without diagnostics; all four
	Fabric Terraform modules and ten repository Bicep-parity modules passed formatting
	and `terraform validate`; every Fabric PowerShell script parsed successfully.
- `pwsh tests/scripts.test.ps1`: passed StrictMode collection behavior,
	fail-closed Azure what-if change policy, portable Function ZIP entries, deterministic
	empty/partial/complete agent-package evidence, and disabled automated agent mutation.
- `pwsh scripts/build-broker-package.ps1 -SkipInstall`: produced a portable
	POSIX-path Function ZIP after running all 8 broker tests; staged production packages
	reported zero vulnerabilities.
- Both PAC agent workspaces package successfully as local Dataverse solutions. The
	packages currently contain only their agent components, and the tooling reports zero
	bound connector/prompt components and performs no cloud import or publication.
- Three sanitized reference screenshots were captured for the live Lakehouse, Data
	Agent, and published Data Agent MCP settings; every image link in `README.md`
	resolves.
- High-confidence scan of 88 Fabric source files found no private key, connection-key,
	credential-shaped value, or JWT. `git diff --check` passed.
- Final blocker-only code review passed after adding full-payload fail-closed what-if
	handling, exact storage-firewall restoration, explicit-tenant data-plane tokens,
	configuration fingerprints, live Graph provenance, explicit app adoption, transactional
	credentials/connectors, principal-scoped consent checks, and a hard workspace Private
	Link gate.
- Source commit `d0b09b6` (`Add Fabric OBO deployment workflow`) was pushed to
	`origin/main` before any Fabric Azure resource, Entra registration, Power Platform
	connector, or Copilot Studio agent mutation.
- Dual-tenant read-only preflight confirmed both configured subscriptions under their
	configured administrator accounts. The existing Fabric-side Linux B1 plan is in West
	US 2; the broker VNet is `10.1.0.0/16`; all configured broker/APIM VNets, subnets,
	resource groups, and the APIM system identity resolved without mutation.
- `Caldova Private` resolved by exact display name to environment
	`52456fcd-1d20-ecdb-aa2e-8979e3f794f5`; its Dataverse URL is in Canada and its
	Managed Environment protection level is `Standard`. No replacement environment was
	created.
- Azure Policy assignment queries with inherited scope enabled returned no assignments
	for either `ai-myaacoub` or `m365-myaacoub`.
- Final fail-closed ARM what-if results after shared-DNS and least-privilege corrections:
	APIM-side peering `Create=1, Ignore=84`; broker-side peering
	`Create=1, Ignore=341`; broker base `Create=23, Ignore=338, NoChange=3`;
	broker Function stage `Create=29, Ignore=338, NoChange=3`; APIM APIs/MCP/DNS
	`Create=29, Ignore=85`. No stage contains Modify, Delete, Deploy, Unsupported,
	or an unknown change type. Full payloads are retained only in the gitignored
	`.generated/what-if` directory.
- Explicit ARM `validate` returned `Succeeded` for both peering templates, broker base,
	broker Function stage, and the subscription-scoped APIM stack. The stage-two broker
	and APIM structural previews use schema-valid placeholder application IDs and a private
	IP because those values are emitted only after stage one and Entra provisioning. The
	deployment must regenerate and review both previews with the real outputs before either
	stage is created.
- Static role verification: the HTTP-only broker UAMI receives Storage Blob Data Owner
	at its dedicated storage account for host/package data, Storage Table Data Contributor
	at that account only for optional host-startup diagnostics, and Key Vault Secrets User
	at its dedicated vault for the versionless OBO reference. It receives no Queue role,
	Metrics Publisher, duplicate Blob Contributor, Key Vault Secrets Officer, resource-group,
	or subscription-wide role. The current deployer receives temporary deployment duties:
	Storage Blob Data Contributor at the dedicated account and Key Vault Secrets Officer at
	the dedicated vault. Bicep and Terraform define the same role and private-endpoint set.
- Shared existing private DNS zones are reused without application tags. Only dedicated
	VNet links, endpoint zone groups, and broker records are created. This removed all
	shared-zone modifications from the final previews.
- Live Azure ARM validation, reviewed what-if, inherited-policy review, environment
	resolution, deployment, connector/agent publication, delegated and denied-user tests,
	and remaining screenshots are not yet complete and are not claimed by this proof.

- [x] All validation checks pass (private Foundry, split APIM products, Fabric OBO, ActualCost, and UI)
	- [x] 1. Core Validation (CLI, tenant-bound auth, build, ARM validation, and what-if)
	- [x] 2. Bicep linting
	- [x] 3. Azure Policy Validation
	- [x] Repository deployment-ready validation with Bicep/Terraform parity

## Role Assignment Verification

- Status: Verified on 2026-09-17 against the final Bicep and Terraform product-split source.
- Broker user-assigned identity: Storage Blob Data Owner and Storage Table Data Contributor
	on its dedicated storage account; Key Vault Secrets User on its dedicated vault; Log
	Analytics Reader on its dedicated workspace. These match identity-based Functions host
	storage/package access, the versionless OBO secret reference, and fixed KQL queries.
- ActualCost exception: the broker identity receives Cost Management Reader, Monitoring
	Reader, and Reader on only resource group `m365-myaacoub`. This is the narrowest scope
	matching `tokenomics.actualCost.scope` and is required by the Cost Management Query API.
	The roles are read-only; no subscription, management-group, billing-account, Contributor,
	or Owner role is introduced.
- Current deployer: Storage Blob Data Contributor on the dedicated storage account and Key
	Vault Secrets Officer on the dedicated vault for package upload and direct secret creation;
	Foundry Project Manager on only `foundry-fabric-costops/fabric-costops` for connection and
	Prompt Agent version provisioning.
- APIM system identity: Cognitive Services User on only `foundry-fabric-costops` for private
	model inference. The identity provisioner separately assigns only the
	`Fabric.Broker.Invoke` Entra application role on the dedicated broker API.
- Foundry project managed identity: no Azure role is needed on APIM; the `ApiManagement`
	connection obtains a token and APIM validates its application ID and audience. The private
	Foundry account identity uses platform-managed Basic Agent resources and performs no
	custom data-plane operation requiring an external role.
- UI Web App: no managed identity and no Azure data-plane permissions; it forwards the
	user's delegated bearer token only to the fixed private tokenomics route.
- Bicep and Terraform use identical role definition IDs/scopes. No Queue role, generic
	Contributor/Owner, duplicate storage role, or write-capable Cost Management role exists.
- Issues: none.
