[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $OutputPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/fabric.json'),
    [switch] $ValidateOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$platform = $config.tokenomicsPlatform
$fabric = $platform.fabric
$fabricApi = 'https://api.fabric.microsoft.com/v1'

function Get-ResponseHeaderValue {
    param(
        [Parameter(Mandatory = $true)] [object] $Response,
        [Parameter(Mandatory = $true)] [string] $Name
    )

    $value = $Response.Headers[$Name]
    if ($null -eq $value) {
        return ''
    }
    return (@($value) -join '')
}

function ConvertFrom-ResponseJson {
    param([Parameter(Mandatory = $true)] [object] $Response)

    if ([string]::IsNullOrWhiteSpace([string]$Response.Content)) {
        return $null
    }
    return $Response.Content | ConvertFrom-Json
}

function Wait-RetryDelay {
    param([int] $Seconds)

    $delay = [Math]::Max(1, [Math]::Min($Seconds, 60))
    [System.Threading.ManualResetEventSlim]::new($false).Wait($delay * 1000)
}

function Invoke-FabricRequest {
    param(
        [Parameter(Mandatory = $true)] [ValidateSet('GET', 'POST', 'PATCH')] [string] $Method,
        [Parameter(Mandatory = $true)] [string] $Uri,
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [object] $Body
    )

    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try {
            $arguments = @{
                Method = $Method
                Uri = $Uri
                Headers = $Headers
            }
            if ($null -ne $Body) {
                $arguments.ContentType = 'application/json'
                $arguments.Body = $Body | ConvertTo-Json -Depth 100 -Compress
            }
            return Invoke-WebRequest @arguments
        }
        catch {
            $statusCode = 0
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }
            if ($attempt -lt 6 -and ($statusCode -eq 429 -or $statusCode -ge 500)) {
                $retryAfter = 5
                if ($_.Exception.Response.Headers -and $_.Exception.Response.Headers['Retry-After']) {
                    $retryAfter = [int](@($_.Exception.Response.Headers['Retry-After'])[0])
                }
                Wait-RetryDelay -Seconds $retryAfter
                continue
            }
            $details = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
            throw "Fabric API $Method $Uri failed with HTTP $statusCode. $details"
        }
    }
}

function Wait-FabricOperation {
    param(
        [Parameter(Mandatory = $true)] [object] $Response,
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [Parameter(Mandatory = $true)] [string] $Description
    )

    if ([int]$Response.StatusCode -ne 202) {
        return
    }

    $operationId = Get-ResponseHeaderValue -Response $Response -Name 'x-ms-operation-id'
    $location = Get-ResponseHeaderValue -Response $Response -Name 'Location'
    if ([string]::IsNullOrWhiteSpace($location) -and -not [string]::IsNullOrWhiteSpace($operationId)) {
        $location = "$fabricApi/operations/$operationId"
    }
    if ([string]::IsNullOrWhiteSpace($location)) {
        throw "$Description returned HTTP 202 without an operation location."
    }
    if ($location.EndsWith('/result', [System.StringComparison]::OrdinalIgnoreCase)) {
        $location = $location.Substring(0, $location.Length - '/result'.Length)
    }

    for ($attempt = 1; $attempt -le 90; $attempt++) {
        $stateResponse = Invoke-FabricRequest -Method GET -Uri $location -Headers $Headers
        $state = ConvertFrom-ResponseJson -Response $stateResponse
        switch ([string]$state.status) {
            'Succeeded' { return }
            'Failed' {
                $errorMessage = if ($state.error.message) { [string]$state.error.message } else { $state | ConvertTo-Json -Depth 20 -Compress }
                throw "$Description failed. $errorMessage"
            }
            'NotStarted' { }
            'Running' { }
            default { throw "$Description returned unexpected operation status '$($state.status)'." }
        }
        $retryAfter = Get-ResponseHeaderValue -Response $stateResponse -Name 'Retry-After'
        Wait-RetryDelay -Seconds $(if ($retryAfter -match '^\d+$') { [int]$retryAfter } else { 5 })
    }
    throw "$Description did not complete within the polling limit."
}

function Get-FabricCollection {
    param(
        [Parameter(Mandatory = $true)] [string] $Uri,
        [Parameter(Mandatory = $true)] [hashtable] $Headers
    )

    $items = [System.Collections.Generic.List[object]]::new()
    $nextUri = $Uri
    while (-not [string]::IsNullOrWhiteSpace($nextUri)) {
        $response = Invoke-FabricRequest -Method GET -Uri $nextUri -Headers $Headers
        $page = ConvertFrom-ResponseJson -Response $response
        foreach ($item in @($page.value)) {
            $items.Add($item)
        }
        $nextUri = [string]$page.continuationUri
    }
    Write-Output -NoEnumerate $items.ToArray()
}

function Find-UniqueFabricObject {
    param(
        [Parameter(Mandatory = $true)] [object[]] $Items,
        [Parameter(Mandatory = $true)] [string] $DisplayName,
        [Parameter(Mandatory = $true)] [string] $Kind
    )

    $matches = @($Items | Where-Object { [string]::Equals([string]$_.displayName, $DisplayName, [System.StringComparison]::Ordinal) })
    if ($matches.Count -gt 1) {
        throw "Multiple $Kind items are named '$DisplayName'."
    }
    if ($matches.Count -eq 1) {
        return $matches[0]
    }
    return $null
}

function New-DataflowDefinition {
    param(
        [Parameter(Mandatory = $true)] [string] $TemplatePath,
        [Parameter(Mandatory = $true)] [hashtable] $Replacements
    )

    $content = Get-Content -LiteralPath $TemplatePath -Raw
    foreach ($entry in $Replacements.GetEnumerator()) {
        $content = $content.Replace([string]$entry.Key, [string]$entry.Value)
    }
    $unresolved = [regex]::Matches($content, '\$\{[A-Z0-9_]+\}') | ForEach-Object { $_.Value } | Select-Object -Unique
    if (@($unresolved).Count -gt 0) {
        throw "Dataflow template '$TemplatePath' contains unresolved placeholders: $($unresolved -join ', ')."
    }

    $dataflowContent = $content | ConvertFrom-Json
    if ([string]::IsNullOrWhiteSpace([string]$dataflowContent.editingSessionMashup.mashupDocument) -or
        $null -ne $dataflowContent.editingSessionMashup.defaultOutputDestinationConfiguration -or
        @($dataflowContent.editingSessionMashup.connectionOverrides).Count -ne 0) {
        throw "Dataflow template '$TemplatePath' must contain a source-only mashup without credentials or destination bindings."
    }

    $normalizedContent = $dataflowContent | ConvertTo-Json -Depth 100 -Compress
    $payload = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($normalizedContent))
    return [ordered]@{
        parts = @(
            [ordered]@{
                path = 'dataflow-content.json'
                payload = $payload
                payloadType = 'InlineBase64'
            }
        )
    }
}

function Write-GeneratedDefinitions {
    param(
        [Parameter(Mandatory = $true)] [object[]] $Artifacts,
        [Parameter(Mandatory = $true)] [string] $Directory
    )

    New-Item -ItemType Directory -Path $Directory -Force | Out-Null
    foreach ($artifact in $Artifacts) {
        $definitionPath = Join-Path $Directory "$($artifact.Slug).definition.json"
        [ordered]@{ definition = $artifact.Definition } | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $definitionPath -Encoding utf8
    }
}

$logAnalyticsWorkspaceId = '00000000-0000-0000-0000-000000000001'
if (-not $ValidateOnly) {
    $logAnalyticsWorkspaceId = az monitor log-analytics workspace show --ids ([string]$platform.logAnalytics.workspaceResourceId) --query customerId -o tsv
    if ($LASTEXITCODE -ne 0 -or $logAnalyticsWorkspaceId -notmatch '^[0-9a-fA-F-]{36}$') {
        throw 'Unable to resolve the Log Analytics customer/workspace ID.'
    }
}

$replacements = @{
    '${COSMOS_ACCOUNT}' = [string]$platform.cosmos.accountName
    '${COSMOS_DATABASE}' = [string]$platform.cosmos.databaseName
    '${COSMOS_CONTAINER}' = [string]$platform.cosmos.containerName
    '${LOG_ANALYTICS_WORKSPACE_ID}' = [string]$logAnalyticsWorkspaceId
    '${LOOKBACK_DAYS}' = [string][int]$platform.logAnalytics.lookbackDays
}
$artifacts = @(
    [pscustomobject]@{
        Slug = 'cosmos-token-consumption'
        DisplayName = [string]$fabric.cosmosDataflowName
        Description = 'Source-only Tokenomics Cosmos transformation. Bind the source connection and Lakehouse staging destination in Fabric before publishing.'
        Definition = New-DataflowDefinition -TemplatePath (Join-Path $repositoryRoot 'fabric/dataflows/cosmos-token-consumption/dataflow-content.json') -Replacements $replacements
    },
    [pscustomobject]@{
        Slug = 'foundry-log-analytics'
        DisplayName = [string]$fabric.logAnalyticsDataflowName
        Description = 'Source-only Microsoft Foundry and platform telemetry transformation. Bind OAuth and Lakehouse destinations in Fabric before publishing.'
        Definition = New-DataflowDefinition -TemplatePath (Join-Path $repositoryRoot 'fabric/dataflows/foundry-log-analytics/dataflow-content.json') -Replacements $replacements
    }
)
$generatedDirectory = Join-Path (Split-Path -Parent $OutputPath) 'dataflows'
Write-GeneratedDefinitions -Artifacts $artifacts -Directory $generatedDirectory

if ($ValidateOnly) {
    [pscustomobject]@{
        Valid = $true
        Dataflows = @($artifacts | ForEach-Object { $_.DisplayName })
        GeneratedDirectory = $generatedDirectory
    }
    return
}

$token = Get-FabricAzAccessToken -TenantId ([string]$config.azure.tenantId) -SubscriptionId ([string]$config.azure.subscriptionId) -Resource 'https://api.fabric.microsoft.com/'
try {
    $headers = @{ Authorization = "Bearer $token" }

    $workspaces = @(Get-FabricCollection -Uri "$fabricApi/workspaces" -Headers $headers)
    $workspace = Find-UniqueFabricObject -Items $workspaces -DisplayName ([string]$fabric.workspaceName) -Kind 'workspace'
    if ($null -eq $workspace) {
        $createWorkspaceResponse = Invoke-FabricRequest -Method POST -Uri "$fabricApi/workspaces" -Headers $headers -Body ([ordered]@{
            displayName = [string]$fabric.workspaceName
            description = 'Governed multi-cloud AI token consumption, cost, forecasting, optimization, and anomaly analytics.'
            capacityId = [string]$fabric.capacityId
        })
        Wait-FabricOperation -Response $createWorkspaceResponse -Headers $headers -Description 'Tokenomics workspace creation'
        $workspaces = @(Get-FabricCollection -Uri "$fabricApi/workspaces" -Headers $headers)
        $workspace = Find-UniqueFabricObject -Items $workspaces -DisplayName ([string]$fabric.workspaceName) -Kind 'workspace'
        if ($null -eq $workspace) {
            throw 'Tokenomics workspace creation completed, but the workspace cannot be resolved.'
        }
    }
    if ([string]$workspace.capacityId -ne [string]$fabric.capacityId) {
        $assignResponse = Invoke-FabricRequest -Method POST -Uri "$fabricApi/workspaces/$($workspace.id)/assignToCapacity" -Headers $headers -Body @{ capacityId = [string]$fabric.capacityId }
        Wait-FabricOperation -Response $assignResponse -Headers $headers -Description 'Tokenomics workspace capacity assignment'
    }

    $workspaceId = [string]$workspace.id
    $lakehouses = @(Get-FabricCollection -Uri "$fabricApi/workspaces/$workspaceId/items?type=Lakehouse" -Headers $headers)
    $lakehouse = Find-UniqueFabricObject -Items $lakehouses -DisplayName ([string]$fabric.lakehouseName) -Kind 'Lakehouse'
    if ($null -eq $lakehouse) {
        $createLakehouseResponse = Invoke-FabricRequest -Method POST -Uri "$fabricApi/workspaces/$workspaceId/lakehouses" -Headers $headers -Body ([ordered]@{
            displayName = [string]$fabric.lakehouseName
            description = 'Schema-enabled Tokenomics medallion Lakehouse.'
            creationPayload = [ordered]@{ enableSchemas = $true }
        })
        Wait-FabricOperation -Response $createLakehouseResponse -Headers $headers -Description 'Tokenomics Lakehouse creation'
        $lakehouses = @(Get-FabricCollection -Uri "$fabricApi/workspaces/$workspaceId/items?type=Lakehouse" -Headers $headers)
        $lakehouse = Find-UniqueFabricObject -Items $lakehouses -DisplayName ([string]$fabric.lakehouseName) -Kind 'Lakehouse'
        if ($null -eq $lakehouse) {
            throw 'Tokenomics Lakehouse creation completed, but the Lakehouse cannot be resolved.'
        }
    }

    $lakehouseDetails = $null
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        $lakehouseResponse = Invoke-FabricRequest -Method GET -Uri "$fabricApi/workspaces/$workspaceId/lakehouses/$($lakehouse.id)" -Headers $headers
        $lakehouseDetails = ConvertFrom-ResponseJson -Response $lakehouseResponse
        $sqlStatus = [string]$lakehouseDetails.properties.sqlEndpointProperties.provisioningStatus
        if ($sqlStatus -eq 'Success') { break }
        if ($sqlStatus -eq 'Failed') { throw 'Lakehouse SQL endpoint provisioning failed.' }
        Wait-RetryDelay -Seconds 10
    }
    if ([string]::IsNullOrWhiteSpace([string]$lakehouseDetails.properties.defaultSchema)) {
        throw "Existing Lakehouse '$($fabric.lakehouseName)' is not schema-enabled."
    }
    if ([string]$lakehouseDetails.properties.sqlEndpointProperties.provisioningStatus -ne 'Success') {
        throw "Lakehouse SQL endpoint is not ready: $($lakehouseDetails.properties.sqlEndpointProperties.provisioningStatus)."
    }

    $dataflowItems = @(Get-FabricCollection -Uri "$fabricApi/workspaces/$workspaceId/items?type=Dataflow" -Headers $headers)
    $provisionedDataflows = @()
    foreach ($artifact in $artifacts) {
        $dataflow = Find-UniqueFabricObject -Items $dataflowItems -DisplayName $artifact.DisplayName -Kind 'Dataflow'
        if ($null -eq $dataflow) {
            $createDataflowResponse = Invoke-FabricRequest -Method POST -Uri "$fabricApi/workspaces/$workspaceId/items" -Headers $headers -Body ([ordered]@{
                displayName = $artifact.DisplayName
                description = $artifact.Description
                type = 'Dataflow'
                definition = $artifact.Definition
            })
            Wait-FabricOperation -Response $createDataflowResponse -Headers $headers -Description "Dataflow '$($artifact.DisplayName)' creation"
            $dataflowItems = @(Get-FabricCollection -Uri "$fabricApi/workspaces/$workspaceId/items?type=Dataflow" -Headers $headers)
            $dataflow = Find-UniqueFabricObject -Items $dataflowItems -DisplayName $artifact.DisplayName -Kind 'Dataflow'
            if ($null -eq $dataflow) {
                throw "Dataflow '$($artifact.DisplayName)' creation completed, but the item cannot be resolved."
            }
        }
        else {
            $updateDataflowResponse = Invoke-FabricRequest -Method POST -Uri "$fabricApi/workspaces/$workspaceId/items/$($dataflow.id)/updateDefinition" -Headers $headers -Body @{ definition = $artifact.Definition }
            Wait-FabricOperation -Response $updateDataflowResponse -Headers $headers -Description "Dataflow '$($artifact.DisplayName)' definition update"
        }
        $provisionedDataflows += [ordered]@{ id = [string]$dataflow.id; displayName = $artifact.DisplayName }
    }

    $metadata = [ordered]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        workspaceId = $workspaceId
        workspaceName = [string]$fabric.workspaceName
        capacityId = [string]$fabric.capacityId
        lakehouseId = [string]$lakehouse.id
        lakehouseName = [string]$fabric.lakehouseName
        sqlEndpointId = [string]$lakehouseDetails.properties.sqlEndpointProperties.id
        sqlEndpointConnectionString = [string]$lakehouseDetails.properties.sqlEndpointProperties.connectionString
        dataflows = $provisionedDataflows
        portalActionsRequired = @(
            'For dfg2_cosmos_token_consumption, bind DocumentDB.Contents with Organizational account access and an approved private network path, or replace the retired connector with Cosmos DB mirroring.',
            'Map token_consumption to a Lakehouse staging table; executable PySpark ingestion separates aws, gcp, oai, and cld schemas.',
            'For dfg2_foundry_log_analytics, bind the Log Analytics Web source with Organizational account access.',
            'Map msft_token_consumption and msft_platform_metric_5m to the corresponding msft Lakehouse tables, then publish both Dataflows.'
        )
    }
    $resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutputPath) -Force | Out-Null
    $metadata | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $resolvedOutputPath -Encoding utf8
    [pscustomobject]$metadata
}
finally {
    $token = $null
    $headers = $null
}