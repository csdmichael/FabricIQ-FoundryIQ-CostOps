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
- [ ] Re-run Azure validation and what-if for the single-tenant Caldova target; record proof below.
- [x] Commit and push source.
- [ ] Deploy Azure resources and application code through the validated Bicep recipe.
- [ ] Publish connectors and both agents only after the target environment resolves.
- [ ] Run delegated-user, denial, MCP handshake, Lakehouse query, and deck-generation tests.
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
	runtime configuration remains explicitly in demo mode; a live build requires generated
	SPA identity metadata and never embeds a credential.
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
	Identity provisioning snapshots the complete vault network ACL object, temporarily opens
	one caller IPv4 `/32` with default deny, writes the in-memory OBO credential, restores the
	exact prior public-access and ACL state in `finally`, and verifies the restoration.
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

- [x] All validation checks pass (single-tenant Caldova Fabric OBO)
	- [x] 1. Core Validation (CLI, tenant-bound auth, build, ARM validation, and what-if)
	- [x] 2. Bicep linting
	- [x] 3. Azure Policy Validation
	- [x] Repository deployment-ready validation with Bicep/Terraform parity

## Role Assignment Verification

- Status: Verified on 2026-09-17 after the tokenomics changes in both `bicep/broker` and
	`terraform/broker`.
- Broker user-assigned identity: Storage Blob Data Owner and Storage Table Data
	Contributor on its dedicated storage account; Key Vault Secrets User on its dedicated
	vault; Log Analytics Reader on its dedicated workspace. These support identity-based
	Functions host/package storage, the versionless OBO secret reference, and read-only
	tokenomics queries against APIM and broker telemetry.
- Current deployer: Storage Blob Data Contributor on the dedicated storage account and
	Key Vault Secrets Officer on the dedicated vault for package upload and direct secret
	creation during deployment.
- APIM system identity: no broad Azure RBAC. The identity provisioner assigns only the
	`Fabric.Broker.Invoke` Entra application role on the dedicated broker API.
- Scope: every Azure role is storage-account, vault, or workspace scoped; no resource-group or subscription-wide role
	is introduced. Bicep and Terraform use the same role definition IDs and scopes.
- Issues: none. No Queue role, generic Contributor, generic Owner, or duplicate storage
	role is granted to the broker identity.
