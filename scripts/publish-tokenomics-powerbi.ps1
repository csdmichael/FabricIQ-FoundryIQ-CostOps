[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $FabricMetadataPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/fabric.json'),
    [string] $FabricSyncPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/fabric-sync.json'),
    [string] $OutputDirectory = (Join-Path $PSScriptRoot '../.generated/tokenomics/powerbi'),
    [switch] $DefinitionOnly,
    [switch] $PreflightOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$configFingerprint = Get-FabricConfigFingerprint -Path $ConfigPath
$tenantId = Assert-FabricGuid -Value $config.azure.tenantId -Name 'azure.tenantId'
$subscriptionId = Assert-FabricGuid -Value $config.azure.subscriptionId -Name 'azure.subscriptionId'
$fabricConfig = $config.tokenomicsPlatform.fabric
$resolvedMetadataPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FabricMetadataPath)
$resolvedFabricSyncPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FabricSyncPath)
$resolvedOutputDirectory = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDirectory)
$fabricApi = 'https://api.fabric.microsoft.com/v1'
$powerBiApi = 'https://api.powerbi.com/v1.0/myorg'

if (-not (Test-Path -LiteralPath $resolvedMetadataPath -PathType Leaf)) {
    throw "Tokenomics Fabric metadata not found: $resolvedMetadataPath. Run scripts/provision-tokenomics-fabric.ps1 first."
}
$fabricMetadata = Get-Content -LiteralPath $resolvedMetadataPath -Raw | ConvertFrom-Json
$workspaceId = Assert-FabricGuid -Value $fabricMetadata.workspaceId -Name 'fabricMetadata.workspaceId'
$lakehouseId = Assert-FabricGuid -Value $fabricMetadata.lakehouseId -Name 'fabricMetadata.lakehouseId'
$sqlEndpointId = Assert-FabricGuid -Value $fabricMetadata.sqlEndpointId -Name 'fabricMetadata.sqlEndpointId'
$sqlEndpointHost = [string]$fabricMetadata.sqlEndpointConnectionString
if ($sqlEndpointHost -notmatch '^[a-z0-9-]+\.datawarehouse\.fabric\.microsoft\.com$') {
    throw 'fabricMetadata.sqlEndpointConnectionString must be a Microsoft Fabric SQL endpoint host.'
}

function Wait-Delay {
    param([int] $Seconds)

    $delay = [Math]::Max(1, [Math]::Min($Seconds, 60))
    $event = [System.Threading.ManualResetEventSlim]::new($false)
    try { $event.Wait($delay * 1000) } finally { $event.Dispose() }
}

function Get-HeaderValue {
    param(
        [Parameter(Mandatory = $true)] [object] $Response,
        [Parameter(Mandatory = $true)] [string] $Name
    )

    $value = $Response.Headers[$Name]
    if ($null -eq $value) { return '' }
    return (@($value) -join '')
}

function ConvertFrom-ResponseJson {
    param([Parameter(Mandatory = $true)] [object] $Response)

    if ([string]::IsNullOrWhiteSpace([string]$Response.Content)) { return $null }
    return $Response.Content | ConvertFrom-Json
}

function Invoke-FabricHttpRequest {
    param(
        [Parameter(Mandatory = $true)] [ValidateSet('GET', 'POST')] [string] $Method,
        [Parameter(Mandatory = $true)] [string] $Uri,
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [object] $Body
    )

    for ($attempt = 1; $attempt -le 6; $attempt++) {
        $arguments = @{
            Method = $Method
            Uri = $Uri
            Headers = $Headers
            SkipHttpErrorCheck = $true
        }
        if ($null -ne $Body) {
            $arguments.ContentType = 'application/json'
            $arguments.Body = $Body | ConvertTo-Json -Depth 100 -Compress
        }
        try {
            $response = Invoke-WebRequest @arguments
        }
        catch {
            if ($attempt -lt 6) {
                Wait-Delay -Seconds 5
                continue
            }
            throw
        }

        $statusCode = [int]$response.StatusCode
        if ($statusCode -ge 200 -and $statusCode -lt 300) { return $response }
        if ($attempt -lt 6 -and ($statusCode -eq 429 -or $statusCode -ge 500)) {
            $retryAfter = Get-HeaderValue -Response $response -Name 'Retry-After'
            Wait-Delay -Seconds $(if ($retryAfter -match '^\d+$') { [int]$retryAfter } else { 5 })
            continue
        }
        throw "Fabric API $Method $Uri failed with HTTP $statusCode. $($response.Content)"
    }
}

function Wait-FabricOperation {
    param(
        [Parameter(Mandatory = $true)] [object] $Response,
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [Parameter(Mandatory = $true)] [string] $Description
    )

    if ([int]$Response.StatusCode -ne 202) { return }
    $location = Get-HeaderValue -Response $Response -Name 'Location'
    $operationId = Get-HeaderValue -Response $Response -Name 'x-ms-operation-id'
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
        $stateResponse = Invoke-FabricHttpRequest -Method GET -Uri $location -Headers $Headers
        $state = ConvertFrom-ResponseJson -Response $stateResponse
        switch ([string]$state.status) {
            'Succeeded' { return }
            'Failed' {
                $details = if ($state.error.message) { [string]$state.error.message } else { $state | ConvertTo-Json -Depth 20 -Compress }
                throw "$Description failed. $details"
            }
            'NotStarted' { }
            'Running' { }
            default { throw "$Description returned unexpected status '$($state.status)'." }
        }
        $retryAfter = Get-HeaderValue -Response $stateResponse -Name 'Retry-After'
        Wait-Delay -Seconds $(if ($retryAfter -match '^\d+$') { [int]$retryAfter } else { 5 })
    }
    throw "$Description did not complete within the polling limit."
}

function Get-FabricItems {
    param([Parameter(Mandatory = $true)] [hashtable] $Headers)

    $items = [System.Collections.Generic.List[object]]::new()
    $nextUri = "$fabricApi/workspaces/$workspaceId/items"
    while (-not [string]::IsNullOrWhiteSpace($nextUri)) {
        $response = Invoke-FabricHttpRequest -Method GET -Uri $nextUri -Headers $Headers
        $page = ConvertFrom-ResponseJson -Response $response
        foreach ($item in @($page.value)) { $items.Add($item) }
        $continuation = $page.PSObject.Properties['continuationUri']
        $nextUri = if ($null -ne $continuation) { [string]$continuation.Value } else { '' }
    }
    return $items.ToArray()
}

function Find-FabricItem {
    param(
        [Parameter(Mandatory = $true)] [object[]] $Items,
        [Parameter(Mandatory = $true)] [string] $DisplayName,
        [Parameter(Mandatory = $true)] [string[]] $Types
    )

    $matches = @($Items | Where-Object {
        $Types -contains [string]$_.type -and
        [string]::Equals([string]$_.displayName, $DisplayName, [System.StringComparison]::Ordinal)
    })
    if ($matches.Count -gt 1) { throw "Multiple Fabric items are named '$DisplayName' with type $($Types -join '/')." }
    if ($matches.Count -eq 1) { return $matches[0] }
    return $null
}

function Publish-FabricDefinition {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [Parameter(Mandatory = $true)] [string] $DisplayName,
        [Parameter(Mandatory = $true)] [string] $Type,
        [Parameter(Mandatory = $true)] [string[]] $TypeAliases,
        [Parameter(Mandatory = $true)] [string] $Description,
        [Parameter(Mandatory = $true)] [object] $Definition
    )

    $items = @(Get-FabricItems -Headers $Headers)
    $item = Find-FabricItem -Items $items -DisplayName $DisplayName -Types $TypeAliases
    if ($null -eq $item) {
        $response = Invoke-FabricHttpRequest -Method POST -Uri "$fabricApi/workspaces/$workspaceId/items" -Headers $Headers -Body ([ordered]@{
            displayName = $DisplayName
            description = $Description
            type = $Type
            definition = $Definition
        })
        Wait-FabricOperation -Response $response -Headers $Headers -Description "$Type '$DisplayName' creation"
    }
    else {
        $response = Invoke-FabricHttpRequest -Method POST -Uri "$fabricApi/workspaces/$workspaceId/items/$($item.id)/updateDefinition" -Headers $Headers -Body ([ordered]@{
            definition = $Definition
        })
        Wait-FabricOperation -Response $response -Headers $Headers -Description "$Type '$DisplayName' definition update"
    }

    for ($attempt = 1; $attempt -le 12; $attempt++) {
        $items = @(Get-FabricItems -Headers $Headers)
        $item = Find-FabricItem -Items $items -DisplayName $DisplayName -Types $TypeAliases
        if ($null -ne $item) { return $item }
        Wait-Delay -Seconds 5
    }
    throw "$Type '$DisplayName' could not be resolved after publication."
}

function Invoke-ArtifactGenerator {
    param([string] $SemanticModelId)

    $node = Get-Command node -ErrorAction Stop
    $generatorPath = Join-Path $PSScriptRoot 'tokenomics/generate-powerbi.mjs'
    $arguments = @(
        $generatorPath,
        '--config', $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ConfigPath),
        '--fabric-metadata', $resolvedMetadataPath,
        '--output', $resolvedOutputDirectory
    )
    if (-not [string]::IsNullOrWhiteSpace($SemanticModelId)) {
        $arguments += @('--semantic-model-id', $SemanticModelId)
    }
    $generatorOutput = & $node.Source @arguments
    if ($LASTEXITCODE -ne 0) { throw "Tokenomics Power BI definition generation failed with exit code $LASTEXITCODE." }
    if ([string]::IsNullOrWhiteSpace([string]$generatorOutput)) { throw 'Tokenomics Power BI definition generation returned no manifest.' }
}

function Get-GeneratedArtifacts {
    $paths = [ordered]@{
        SemanticModel = Join-Path $resolvedOutputDirectory 'semantic-model.definition.json'
        ConsumptionReport = Join-Path $resolvedOutputDirectory 'consumption-report.definition.json'
        MlReport = Join-Path $resolvedOutputDirectory 'ml-report.definition.json'
        Manifest = Join-Path $resolvedOutputDirectory 'manifest.json'
    }
    foreach ($entry in $paths.GetEnumerator()) {
        if (-not (Test-Path -LiteralPath $entry.Value -PathType Leaf)) { throw "Generated Power BI artifact '$($entry.Key)' is missing." }
    }
    return [pscustomobject]@{
        Paths = $paths
        SemanticModel = Get-Content -LiteralPath $paths.SemanticModel -Raw | ConvertFrom-Json
        ConsumptionReport = Get-Content -LiteralPath $paths.ConsumptionReport -Raw | ConvertFrom-Json
        MlReport = Get-Content -LiteralPath $paths.MlReport -Raw | ConvertFrom-Json
        Manifest = Get-Content -LiteralPath $paths.Manifest -Raw | ConvertFrom-Json
    }
}

function Assert-LakehouseReportingContract {
    param(
        [Parameter(Mandatory = $true)] [object[]] $TableContracts,
        [Parameter(Mandatory = $true)] [object] $SyncCheckpoint
    )

    Add-Type -AssemblyName System.Data
    $sqlToken = Get-FabricAzAccessToken -TenantId $tenantId -SubscriptionId $subscriptionId -Resource 'https://database.windows.net/'
    $connection = [System.Data.SqlClient.SqlConnection]::new("Server=tcp:$sqlEndpointHost,1433;Initial Catalog=$($fabricConfig.lakehouseName);Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;")
    $connection.AccessToken = $sqlToken
    $available = @{}
    $summary = $null
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandTimeout = 120
        $command.CommandText = 'SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS'
        $reader = $command.ExecuteReader()
        try {
            while ($reader.Read()) {
                $key = "$([string]$reader.GetValue(0)).$([string]$reader.GetValue(1))".ToLowerInvariant()
                if (-not $available.ContainsKey($key)) { $available[$key] = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase) }
                $null = $available[$key].Add([string]$reader.GetValue(2))
            }
        }
        finally { $reader.Dispose() }

        $summaryCommand = $connection.CreateCommand()
        $summaryCommand.CommandTimeout = 120
        $summaryCommand.CommandText = 'SELECT COUNT_BIG(*) AS row_count, SUM(CAST(request_count AS bigint)) AS request_count, SUM(CAST(total_tokens AS bigint)) AS total_tokens FROM ml.tokenomics_usage_fact'
        $summaryReader = $summaryCommand.ExecuteReader()
        try {
            if (-not $summaryReader.Read()) { throw 'The Tokenomics usage fact aggregate query returned no row.' }
            $summary = [pscustomobject]@{
                RowCount = [int64]$summaryReader['row_count']
                RequestCount = [int64]$summaryReader['request_count']
                TotalTokens = [int64]$summaryReader['total_tokens']
            }
        }
        finally { $summaryReader.Dispose() }
    }
    finally {
        $connection.Dispose()
        $sqlToken = $null
    }

    $missingTables = [System.Collections.Generic.List[string]]::new()
    $missingColumns = [System.Collections.Generic.List[string]]::new()
    foreach ($contract in $TableContracts) {
        $qualifiedName = [string]$contract.qualifiedName
        $key = $qualifiedName.ToLowerInvariant()
        if (-not $available.ContainsKey($key)) {
            $missingTables.Add($qualifiedName)
            continue
        }
        foreach ($column in @($contract.columns)) {
            if (-not $available[$key].Contains([string]$column)) { $missingColumns.Add("$qualifiedName.$column") }
        }
    }
    if ($missingTables.Count -gt 0 -or $missingColumns.Count -gt 0) {
        $parts = @()
        if ($missingTables.Count -gt 0) { $parts += "missing tables: $($missingTables -join ', ')" }
        if ($missingColumns.Count -gt 0) { $parts += "missing columns: $($missingColumns -join ', ')" }
        throw "Tokenomics Power BI publication is blocked because the Lakehouse reporting contract is incomplete ($($parts -join '; ')). Run ingestion and all 12 inference notebooks first."
    }
    if ($summary.RowCount -ne [int64]$SyncCheckpoint.rowCount -or
        $summary.RequestCount -ne [int64]$SyncCheckpoint.requestCount -or
        $summary.TotalTokens -ne [int64]$SyncCheckpoint.totalTokens) {
        throw "Tokenomics Power BI publication is blocked because live SQL totals do not match the verified Fabric synchronization checkpoint (rows=$($summary.RowCount), requests=$($summary.RequestCount), tokens=$($summary.TotalTokens))."
    }
    return [pscustomobject]@{
        Valid = $true
        TableCount = $TableContracts.Count
        RowCount = $summary.RowCount
        RequestCount = $summary.RequestCount
        TotalTokens = $summary.TotalTokens
        EventSetSha256 = [string]$SyncCheckpoint.cosmosEventSetSha256
    }
}

function Invoke-PowerBiRequest {
    param(
        [Parameter(Mandatory = $true)] [ValidateSet('GET', 'POST')] [string] $Method,
        [Parameter(Mandatory = $true)] [string] $Uri,
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [object] $Body
    )

    $arguments = @{ Method = $Method; Uri = $Uri; Headers = $Headers }
    if ($null -ne $Body) {
        $arguments.ContentType = 'application/json'
        $arguments.Body = $Body | ConvertTo-Json -Depth 20 -Compress
    }
    return Invoke-RestMethod @arguments
}

function Ensure-PowerBiDashboard {
    param(
        [Parameter(Mandatory = $true)] [hashtable] $Headers,
        [Parameter(Mandatory = $true)] [string] $DashboardName,
        [Parameter(Mandatory = $true)] [string] $SourceReportId,
        [Parameter(Mandatory = $true)] [string] $SourceReportName,
        [Parameter(Mandatory = $true)] [string] $SourcePageName
    )

    $uri = "$powerBiApi/groups/$workspaceId/dashboards"
    $dashboards = @((Invoke-PowerBiRequest -Method GET -Uri $uri -Headers $Headers).value)
    $matches = @($dashboards | Where-Object { [string]::Equals([string]$_.displayName, $DashboardName, [System.StringComparison]::Ordinal) })
    if ($matches.Count -gt 1) { throw "Multiple Power BI dashboards are named '$DashboardName'." }
    $dashboard = if ($matches.Count -eq 1) { $matches[0] } else { Invoke-PowerBiRequest -Method POST -Uri $uri -Headers $Headers -Body @{ name = $DashboardName } }
    $tiles = @((Invoke-PowerBiRequest -Method GET -Uri "$uri/$($dashboard.id)/tiles" -Headers $Headers).value)
    $sourceTiles = @($tiles | Where-Object { [string]$_.reportId -eq $SourceReportId })
    return [pscustomobject]@{
        id = [string]$dashboard.id
        displayName = $DashboardName
        webUrl = [string]$dashboard.webUrl
        sourceReportId = $SourceReportId
        sourceReportName = $SourceReportName
        sourcePageName = $SourcePageName
        sourceTileCount = $sourceTiles.Count
        complete = $sourceTiles.Count -gt 0
        portalActionRequired = if ($sourceTiles.Count -eq 0) { "Open '$SourceReportName', select page '$SourcePageName', and use More options > Pin to a dashboard > Existing dashboard '$DashboardName' > Pin live." } else { $null }
    }
}

Invoke-ArtifactGenerator
$artifacts = Get-GeneratedArtifacts
if ($DefinitionOnly) {
    [pscustomobject]@{
        Valid = $true
        OutputDirectory = $resolvedOutputDirectory
        SemanticTableCount = [int]$artifacts.Manifest.semanticModel.tableCount
        ReportCount = @($artifacts.Manifest.reports).Count
        ReportPageCount = (@($artifacts.Manifest.reports | ForEach-Object { @($_.pageNames).Count }) | Measure-Object -Sum).Sum
        DashboardCount = @($artifacts.Manifest.dashboards).Count
        RequiredTableCount = @($artifacts.Manifest.tableContracts).Count
    }
    return
}

if ([string]$fabricMetadata.configFingerprint -ne $configFingerprint) {
    throw 'Tokenomics Fabric metadata does not match the active deployment configuration. Run tokenomics-fabric first.'
}
if (-not (Test-Path -LiteralPath $resolvedFabricSyncPath -PathType Leaf)) {
    throw "Tokenomics Fabric synchronization checkpoint not found: $resolvedFabricSyncPath. Run tokenomics-sync first."
}
$fabricSync = Get-Content -LiteralPath $resolvedFabricSyncPath -Raw | ConvertFrom-Json
if ([string]$fabricSync.configFingerprint -ne $configFingerprint -or
    [string]$fabricSync.workspaceId -ne $workspaceId -or
    [string]$fabricSync.lakehouseId -ne $lakehouseId -or
    [string]$fabricSync.cosmosEventSetSha256 -notmatch '^[0-9a-f]{64}$' -or
    [string]$fabricSync.microsoftTelemetrySha256 -notmatch '^[0-9a-f]{64}$' -or
    [int]$fabricSync.microsoftTelemetryRecordCount -lt 0 -or
    [int]$fabricSync.reportingTableCount -ne @($artifacts.Manifest.tableContracts).Count) {
    throw 'Tokenomics Fabric synchronization checkpoint does not match the active report target or definition.'
}

$preflight = Assert-LakehouseReportingContract -TableContracts @($artifacts.Manifest.tableContracts) -SyncCheckpoint $fabricSync
if ($PreflightOnly) {
    $preflight
    return
}

$fabricToken = Get-FabricAzAccessToken -TenantId $tenantId -SubscriptionId $subscriptionId -Resource 'https://api.fabric.microsoft.com/'
try {
    $fabricHeaders = @{ Authorization = "Bearer $fabricToken" }
    $semanticModel = Publish-FabricDefinition -Headers $fabricHeaders -DisplayName ([string]$fabricConfig.semanticModelName) -Type 'SemanticModel' -TypeAliases @('SemanticModel', 'Dataset') -Description 'Governed Tokenomics usage, cost, price history, model runs, and outputs for all 12 ML use cases.' -Definition $artifacts.SemanticModel

    Invoke-ArtifactGenerator -SemanticModelId ([string]$semanticModel.id)
    $artifacts = Get-GeneratedArtifacts
    $consumptionReport = Publish-FabricDefinition -Headers $fabricHeaders -DisplayName ([string]$fabricConfig.reportName) -Type 'Report' -TypeAliases @('Report') -Description 'Token consumption and dollars by date, team, user, project, cost center, provider, model family, model, and version.' -Definition $artifacts.ConsumptionReport
    $mlReport = Publish-FabricDefinition -Headers $fabricHeaders -DisplayName ([string]$fabricConfig.mlReportName) -Type 'Report' -TypeAliases @('Report') -Description 'Portfolio and detailed Power BI pages for all 12 Tokenomics ML algorithm outputs.' -Definition $artifacts.MlReport

    $powerBiToken = Get-FabricAzAccessToken -TenantId $tenantId -SubscriptionId $subscriptionId -Resource 'https://analysis.windows.net/powerbi/api'
    try {
        $powerBiHeaders = @{ Authorization = "Bearer $powerBiToken" }
        $executiveDashboard = Ensure-PowerBiDashboard -Headers $powerBiHeaders -DashboardName ([string]$fabricConfig.dashboardName) -SourceReportId ([string]$consumptionReport.id) -SourceReportName ([string]$fabricConfig.reportName) -SourcePageName 'Executive Overview'
        $mlDashboard = Ensure-PowerBiDashboard -Headers $powerBiHeaders -DashboardName ([string]$fabricConfig.mlDashboardName) -SourceReportId ([string]$mlReport.id) -SourceReportName ([string]$fabricConfig.mlReportName) -SourcePageName 'ML Portfolio Overview'
    }
    finally {
        $powerBiToken = $null
        $powerBiHeaders = $null
    }

    $publication = [ordered]@{
        schemaVersion = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        workspaceId = $workspaceId
        lakehouseId = $lakehouseId
        sqlEndpointId = $sqlEndpointId
        semanticModel = [ordered]@{ id = [string]$semanticModel.id; displayName = [string]$fabricConfig.semanticModelName }
        reports = @(
            [ordered]@{ id = [string]$consumptionReport.id; displayName = [string]$fabricConfig.reportName; pageCount = @($artifacts.Manifest.reports[0].pageNames).Count },
            [ordered]@{ id = [string]$mlReport.id; displayName = [string]$fabricConfig.mlReportName; pageCount = 14 }
        )
        dashboards = @($executiveDashboard, $mlDashboard)
        complete = [bool]($executiveDashboard.complete -and $mlDashboard.complete)
        portalActionsRequired = @($executiveDashboard.portalActionRequired, $mlDashboard.portalActionRequired | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    }
    $publicationPath = Join-Path $resolvedOutputDirectory 'published.json'
    $publication | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $publicationPath -Encoding utf8
    [pscustomobject]$publication
}
finally {
    $fabricToken = $null
    $fabricHeaders = $null
}