[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [switch] $DeploymentReady,
    [switch] $IncludeParity,
    [switch] $SkipTerraformInit
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$defaultConfigPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath((Join-Path $repositoryRoot 'config/deployment.json'))
$resolvedConfigPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ConfigPath)
if (-not [string]::Equals($defaultConfigPath, $resolvedConfigPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'validate.ps1 accepts only config/deployment.json because the APIM and network Bicep entry points load that exact file.'
}

foreach ($path in 'azure.tenantId', 'azure.subscriptionId', 'fabric.workspaceId', 'fabric.lakehouseId', 'fabric.sqlEndpointId', 'fabric.dataAgentId', 'apim.tenantId', 'apim.subscriptionId', 'identity.resourceTenantId', 'identity.callerTenantId') {
    $null = Assert-FabricGuid -Value (Get-FabricConfigValue -Config $config -Path $path) -Name $path
}
if ($config.azure.tenantId -ne $config.identity.resourceTenantId) {
    throw 'azure.tenantId must match identity.resourceTenantId.'
}
if ($config.apim.tenantId -ne $config.identity.callerTenantId -or $config.powerPlatform.tenantId -ne $config.identity.callerTenantId) {
    throw 'APIM and Power Platform tenant IDs must match identity.callerTenantId.'
}
if ($config.azure.tenantId -ne $config.apim.tenantId -or $config.azure.tenantId -ne $config.powerPlatform.tenantId -or
    $config.azure.subscriptionId -ne $config.apim.subscriptionId -or $config.azure.resourceGroup -ne $config.apim.resourceGroup) {
    throw 'Fabric, broker, APIM, and Power Platform must use the same configured tenant; Azure resources must use one subscription and resource group.'
}
if ($config.network.mode -notin @('single-tenant-shared-vnet', 'single-tenant-existing-peering') -or [bool]$config.deployment.deployNetworking) {
    throw 'The active topology must use an existing single-tenant network path and must not deploy VNet peerings.'
}
if ($config.network.mode -eq 'single-tenant-shared-vnet' -and $config.network.apimVnetResourceId -ne $config.network.brokerVnetResourceId) {
    throw 'single-tenant-shared-vnet requires APIM and broker to use the same VNet.'
}
if ($config.network.mode -eq 'single-tenant-existing-peering' -and $config.network.apimVnetResourceId -eq $config.network.brokerVnetResourceId) {
    throw 'single-tenant-existing-peering requires distinct APIM and broker VNets.'
}
foreach ($path in 'apim.location', 'apim.serviceName', 'apim.skuName', 'apim.publisherEmail', 'apim.publisherName', 'apim.publicNetworkAccess', 'apim.tokenomicsApiId', 'apim.tokenomicsApiPath', 'apim.inferenceApis.lakehouse.id', 'apim.inferenceApis.lakehouse.path', 'apim.inferenceApis.dataAgent.id', 'apim.inferenceApis.dataAgent.path', 'apim.fabricProductId', 'apim.foundryProductId', 'network.apimSubnetName', 'network.apimSubnetPrefix', 'foundry.accountName', 'foundry.projectName', 'foundry.location', 'foundry.agentSubnetName', 'foundry.agentSubnetPrefix', 'foundry.model.name', 'foundry.model.version', 'foundry.model.skuName', 'identity.allowedUserPrincipalName', 'identity.dashboardClientDisplayName', 'tokenomics.projectId', 'tokenomics.teamId', 'tokenomics.costCenter', 'tokenomics.currency', 'tokenomics.actualCost.scope', 'tokenomics.actualCost.queryApiVersion', 'ui.appName', 'ui.existingPlanName', 'ui.productionUrl', 'ui.allowedOrigin', 'ui.environment') {
    $null = Get-FabricConfigValue -Config $config -Path $path
}
if ($config.apim.publicNetworkAccess -notin @('Enabled', 'Disabled')) {
    throw 'apim.publicNetworkAccess must be Enabled or Disabled.'
}
if ($config.apim.fabricProductId -ne 'fabric' -or $config.apim.foundryProductId -ne 'foundry') {
    throw 'APIM product IDs must be exactly fabric and foundry.'
}
if ([bool]$config.deployment.deployWorkspacePrivateLink) {
    throw 'deployment.deployWorkspacePrivateLink must remain false while unsupported semantic models or external Copilot integrations exist.'
}
foreach ($flag in 'deployTokenomicsData', 'deployTokenomicsSeed', 'deployTokenomicsFabric') {
    if ($config.deployment.$flag -isnot [bool]) {
        throw "deployment.$flag must be a boolean."
    }
}
if ($config.identity.fabricApiScope -ne 'https://api.fabric.microsoft.com/.default' -or $config.identity.powerBiApiScope -ne 'https://analysis.windows.net/powerbi/api/.default') {
    throw 'Fabric and Power BI downstream scopes must use the approved fixed values.'
}
if ($config.fabric.sqlEndpointHost -notmatch '^[a-z0-9-]+\.datawarehouse\.fabric\.microsoft\.com$') {
    throw 'fabric.sqlEndpointHost is not a Microsoft Fabric SQL endpoint host.'
}
if ($config.apim.gatewayUrl -notmatch '^https://[a-z0-9-]+\.azure-api\.net/?$') {
    throw 'apim.gatewayUrl must be an HTTPS azure-api.net origin.'
}
if ($config.ui.allowedOrigin -notmatch '^https?://[^/]+$' -or @($config.ui.redirectUris).Count -lt 1 -or
    @($config.ui.redirectUris) -notcontains $config.ui.allowedOrigin -or @($config.ui.redirectUris | Where-Object { $_ -notmatch '^https?://[^/]+$' }).Count -gt 0 -or
    $config.ui.productionUrl -ne "https://$($config.ui.appName).azurewebsites.net" -or @($config.ui.redirectUris) -notcontains $config.ui.productionUrl) {
    throw 'UI origins, production URL, and SPA redirect URIs are inconsistent.'
}
if ($config.tokenomics.currency -notmatch '^[A-Z]{3}$' -or $config.tokenomics.projectId -notmatch '^[A-Za-z0-9._-]{1,64}$' -or
    $config.tokenomics.teamId -notmatch '^[A-Za-z0-9._-]{1,64}$' -or $config.tokenomics.costCenter -notmatch '^[A-Za-z0-9._-]{1,64}$') {
    throw 'Tokenomics currency and allocation dimensions are invalid.'
}
if (-not [bool]$config.tokenomics.actualCost.enabled -or $config.tokenomics.actualCost.scope -ne "/subscriptions/$($config.azure.subscriptionId)/resourceGroups/$($config.azure.resourceGroup)" -or
    $config.tokenomics.actualCost.queryApiVersion -notmatch '^20\d{2}-\d{2}-\d{2}$' -or [int]$config.tokenomics.actualCost.billingLagHours -lt 1 -or [int]$config.tokenomics.actualCost.billingLagHours -gt 168 -or
    @($config.tokenomics.actualCost.trackedResources).Count -lt 4 -or @($config.tokenomics.actualCost.trackedResources | Where-Object { $_.resourceId -notlike "$($config.tokenomics.actualCost.scope)/providers/*" -or $_.category -notin @('model', 'gateway', 'broker', 'ui') }).Count -gt 0) {
    throw 'Azure ActualCost configuration must be enabled, resource-group scoped, bounded, and contain only tracked deployment resources.'
}
$tokenomicsPlatform = $config.tokenomicsPlatform
foreach ($path in 'tokenomicsPlatform.rawStorage.accountName', 'tokenomicsPlatform.rawStorage.containerName', 'tokenomicsPlatform.rawStorage.prefix', 'tokenomicsPlatform.cosmos.accountName', 'tokenomicsPlatform.cosmos.databaseName', 'tokenomicsPlatform.cosmos.containerName', 'tokenomicsPlatform.fabric.workspaceName', 'tokenomicsPlatform.fabric.lakehouseName', 'tokenomicsPlatform.fabric.cosmosDataflowName', 'tokenomicsPlatform.fabric.logAnalyticsDataflowName', 'tokenomicsPlatform.fabric.trainingNotebookName', 'tokenomicsPlatform.fabric.inferenceNotebookName', 'tokenomicsPlatform.fabric.semanticModelName', 'tokenomicsPlatform.fabric.reportName', 'tokenomicsPlatform.fabric.outputSchema', 'tokenomicsPlatform.logAnalytics.workspaceResourceId') {
    $null = Get-FabricConfigValue -Config $config -Path $path
}
if ($tokenomicsPlatform.rawStorage.accountName -notmatch '^[a-z0-9]{3,24}$' -or
    $tokenomicsPlatform.rawStorage.containerName -notmatch '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$' -or
    $tokenomicsPlatform.cosmos.accountName -notmatch '^[a-z0-9-]{3,44}$' -or
    $tokenomicsPlatform.cosmos.databaseName -notmatch '^[A-Za-z0-9._-]{1,255}$' -or
    $tokenomicsPlatform.cosmos.containerName -notmatch '^[A-Za-z0-9._-]{1,255}$' -or
    $tokenomicsPlatform.cosmos.partitionKeyPath -ne '/source_code') {
    throw 'Tokenomics Storage/Cosmos names or partition key are invalid.'
}
if ([int]$tokenomicsPlatform.syntheticData.recordCount -lt 4000 -or [int]$tokenomicsPlatform.syntheticData.recordCount -gt 1000000 -or
    [int]$tokenomicsPlatform.syntheticData.userCount -lt 100 -or [int]$tokenomicsPlatform.syntheticData.userCount -gt 100000 -or
    [int]$tokenomicsPlatform.syntheticData.lookbackDays -lt 30 -or [int]$tokenomicsPlatform.syntheticData.lookbackDays -gt 730 -or
    $tokenomicsPlatform.syntheticData.endDate -notmatch '^20\d{2}-\d{2}-\d{2}$' -or
    [int64]$tokenomicsPlatform.syntheticData.randomSeed -lt 1) {
    throw 'Tokenomics synthetic-data scale must remain bounded and production-like.'
}
if (@($tokenomicsPlatform.syntheticData.sourceCodes) -join ',' -ne 'aws,gcp,oai,cld' -or
    @($tokenomicsPlatform.fabric.sourceSchemas) -join ',' -ne 'aws,gcp,oai,cld,msft' -or
    $tokenomicsPlatform.fabric.outputSchema -ne 'ml') {
    throw 'Tokenomics source and output schema codes must use aws,gcp,oai,cld,msft and ml.'
}
$null = Assert-FabricGuid -Value $tokenomicsPlatform.fabric.capacityId -Name 'tokenomicsPlatform.fabric.capacityId'
foreach ($path in 'workspaceId', 'lakehouseId', 'sqlEndpointId') {
    $value = [string]$tokenomicsPlatform.fabric.$path
    if (-not [string]::IsNullOrWhiteSpace($value)) {
        $null = Assert-FabricGuid -Value $value -Name "tokenomicsPlatform.fabric.$path"
    }
}
$expectedLogAnalyticsPrefix = "/subscriptions/$($config.azure.subscriptionId)/resourceGroups/$($config.azure.resourceGroup)/providers/Microsoft.OperationalInsights/workspaces/"
if (-not ([string]$tokenomicsPlatform.logAnalytics.workspaceResourceId).StartsWith($expectedLogAnalyticsPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    [int]$tokenomicsPlatform.logAnalytics.lookbackDays -lt 1 -or [int]$tokenomicsPlatform.logAnalytics.lookbackDays -gt 365) {
    throw 'Tokenomics Log Analytics source must be resource-group scoped with a bounded lookback.'
}
if ($config.foundry.location -ne $config.apim.location -or $config.foundry.vnetResourceId -ne $config.network.apimVnetResourceId -or
    $config.foundry.privateEndpointSubnetResourceId -ne $config.network.apimPrivateEndpointSubnetResourceId -or
    $config.foundry.agentSubnetPrefix -notmatch '^10\.(?:\d{1,3}\.){2}0/24$' -or $config.foundry.model.name -ne 'gpt-5.6-sol' -or
    $config.foundry.model.version -ne '2026-07-09' -or $config.foundry.model.skuName -ne 'GlobalStandard' -or [int]$config.foundry.model.capacity -lt 1) {
    throw 'Private Foundry region, network, and pinned model configuration are invalid.'
}
$inferenceApiIds = @($config.apim.inferenceApis.lakehouse.id, $config.apim.inferenceApis.dataAgent.id)
$agentNames = @($config.foundry.agents.lakehouse, $config.foundry.agents.dataAgent)
if (@($inferenceApiIds | Select-Object -Unique).Count -ne 2 -or @($agentNames | Select-Object -Unique).Count -ne 2 -or
    @($config.foundry.mcpConnections.lakehouse.allowedTools) -join ',' -ne 'tables,query' -or @($config.foundry.mcpConnections.dataAgent.allowedTools) -join ',' -ne 'query') {
    throw 'Foundry per-agent gateway identities and MCP allowlists must be distinct and least privilege.'
}
if ($config.broker.runtime -ne '~22' -or $config.ui.existingPlanName -ne $config.broker.existingPlanName -or
    $config.ui.integrationSubnetResourceId -ne $config.network.brokerIntegrationSubnetResourceId) {
    throw 'Broker and UI must use Node 22 on the same existing Windows plan and integration subnet.'
}
foreach ($path in 'network.brokerVnetResourceId', 'network.brokerPrivateEndpointSubnetResourceId', 'network.brokerIntegrationSubnetResourceId', 'network.apimVnetResourceId', 'foundry.vnetResourceId', 'foundry.privateEndpointSubnetResourceId', 'ui.integrationSubnetResourceId') {
    $resourceId = [string](Get-FabricConfigValue -Config $config -Path $path)
    if ($resourceId -notmatch '^/subscriptions/[0-9a-f-]+/resourceGroups/[^/]+/providers/Microsoft\.Network/virtualNetworks/[^/]+(?:/subnets/[^/]+)?$') {
        throw "$path is not a valid virtual network or subnet resource ID."
    }
}
foreach ($path in 'network.brokerExistingPrivateDnsVnetLinks.web', 'network.brokerExistingPrivateDnsVnetLinks.blob') {
    $linkName = [string](Get-FabricConfigValue -Config $config -Path $path)
    if ($linkName -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,78}[A-Za-z0-9])?$') {
        throw "$path is not a valid private DNS VNet link name."
    }
}

if ($DeploymentReady) {
    $null = Assert-FabricGuid -Value $config.powerPlatform.environmentId -Name 'powerPlatform.environmentId'
    $null = Assert-FabricGuidList -Values @($config.identity.allowedUserObjectIds) -Name 'identity.allowedUserObjectIds'
}

Write-Host 'PASS configuration contract'

Push-Location $repositoryRoot
try {
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('run', 'build', '--prefix', 'functions/obo-broker') -Description 'Broker build'
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('test', '--prefix', 'functions/obo-broker') -Description 'Broker tests'
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('audit', '--prefix', 'functions/obo-broker', '--omit=dev') -Description 'Broker production dependency audit'
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('run', 'build', '--prefix', 'ui') -Description 'Tokenomics UI build'
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('test', '--prefix', 'ui', '--', '--watch=false') -Description 'Tokenomics UI tests'
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('audit', '--prefix', 'ui', '--omit=dev') -Description 'Tokenomics UI production dependency audit'
    Invoke-FabricNative -FilePath 'node' -ArgumentList @('--check', 'ui/server.js') -Description 'Production UI host syntax'
    Invoke-FabricNative -FilePath 'python' -ArgumentList @('-m', 'py_compile', 'scripts/provision-foundry-agents.py') -Description 'Foundry Prompt Agent helper syntax'

    foreach ($file in Get-ChildItem (Join-Path $repositoryRoot 'apim/openapi/*.json')) {
        $null = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    }
    foreach ($file in Get-ChildItem (Join-Path $repositoryRoot 'apim/policies/*.xml')) {
        [xml]$policy = Get-Content -LiteralPath $file.FullName -Raw
        if ($policy.DocumentElement.Name -ne 'policies') {
            throw "Invalid APIM policy root in $($file.FullName)."
        }
    }
    Write-Host 'PASS APIM OpenAPI and policy syntax'

    $dataflowFiles = @(
        'fabric/dataflows/cosmos-token-consumption/dataflow-content.json',
        'fabric/dataflows/foundry-log-analytics/dataflow-content.json'
    )
    foreach ($file in $dataflowFiles) {
        $dataflow = Get-Content -LiteralPath (Join-Path $repositoryRoot $file) -Raw | ConvertFrom-Json
        if ([string]::IsNullOrWhiteSpace([string]$dataflow.editingSessionMashup.mashupDocument) -or
            $null -ne $dataflow.editingSessionMashup.defaultOutputDestinationConfiguration -or
            @($dataflow.editingSessionMashup.connectionOverrides).Count -ne 0) {
            throw "Invalid source-only Dataflow definition: $file"
        }
    }
    & (Join-Path $repositoryRoot 'scripts/provision-tokenomics-fabric.ps1') -ValidateOnly | Out-Null
    Write-Host 'PASS Dataflow Gen2 definitions and Fabric provisioner'
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('test', '--prefix', 'scripts/tokenomics') -Description 'Tokenomics data generator tests'
    Invoke-FabricNative -FilePath 'node' -ArgumentList @('--check', 'scripts/tokenomics/seed-data.mjs') -Description 'Tokenomics private seed syntax'

    $bicepFiles = @(
        'bicep/apim/service.bicep',
        'bicep/broker/main.bicep',
        'bicep/apim/main.bicep',
        'bicep/foundry/main.bicep',
        'bicep/foundry/connections.bicep',
        'bicep/ui/main.bicep',
        'bicep/tokenomics-data/main.bicep'
    )
    foreach ($file in $bicepFiles) {
        $compiled = az bicep build --file $file --stdout
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($compiled)) {
            throw "Bicep build failed: $file"
        }
        az bicep lint --file $file
        if ($LASTEXITCODE -ne 0) {
            throw "Bicep lint failed: $file"
        }
    }
    Write-Host 'PASS Bicep build and lint'

    $terraformModules = @(
        'terraform/broker',
        'terraform/apim',
        'terraform/foundry',
        'terraform/ui'
    )
    if ($IncludeParity) {
        $terraformModules = @(Get-ChildItem (Join-Path $repositoryRoot 'terraform') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'versions.tf') } | ForEach-Object { "terraform/$($_.Name)" })
    }
    foreach ($module in $terraformModules) {
        Invoke-FabricNative -FilePath 'terraform' -ArgumentList @("-chdir=$module", 'fmt', '-check') -Description "Terraform formatting for $module"
        if (-not $SkipTerraformInit) {
            Invoke-FabricNative -FilePath 'terraform' -ArgumentList @("-chdir=$module", 'init', '-backend=false', '-input=false', '-no-color') -Description "Terraform initialization for $module"
        }
        Invoke-FabricNative -FilePath 'terraform' -ArgumentList @("-chdir=$module", 'validate', '-no-color') -Description "Terraform validation for $module"
    }
    Write-Host 'PASS Terraform formatting and validation'

    $parseFailures = @()
    foreach ($file in Get-ChildItem (Join-Path $repositoryRoot 'scripts/*.ps1')) {
        $tokens = $null
        $parseErrors = $null
        $null = [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
        if ($parseErrors.Count -gt 0) {
            $parseFailures += "$($file.Name): $($parseErrors.Message -join '; ')"
        }
    }
    if ($parseFailures.Count -gt 0) {
        throw "PowerShell parse failures: $($parseFailures -join ' | ')"
    }
    Write-Host 'PASS PowerShell syntax'

    & (Join-Path $repositoryRoot 'tests/scripts.test.ps1')
}
finally {
    Pop-Location
}

Write-Host 'Fabric local validation completed successfully.' -ForegroundColor Green