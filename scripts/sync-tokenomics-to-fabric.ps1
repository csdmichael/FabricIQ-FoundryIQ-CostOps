[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $FabricMetadataPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/fabric.json'),
    [string] $CosmosSeedCheckpointPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/cosmos-seed.json'),
    [string] $OutputPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/fabric-sync.json'),
    [ValidateRange(15, 1440)] [int] $MaximumCheckpointAgeMinutes = 120
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')
. (Join-Path $PSScriptRoot 'tokenomics-sync-contract.ps1')

function Wait-Delay {
    param([int] $Seconds)

    $event = [System.Threading.ManualResetEventSlim]::new($false)
    try { $null = $event.Wait([Math]::Max(1, $Seconds) * 1000) } finally { $event.Dispose() }
}

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$configFingerprint = Get-FabricConfigFingerprint -Path $ConfigPath
$resolvedFabricMetadataPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FabricMetadataPath)
$resolvedSeedCheckpointPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($CosmosSeedCheckpointPath)
foreach ($path in $resolvedFabricMetadataPath, $resolvedSeedCheckpointPath) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required Tokenomics checkpoint not found: $path" }
}
$fabricMetadata = Get-Content -LiteralPath $resolvedFabricMetadataPath -Raw | ConvertFrom-Json
$seedCheckpoint = Get-Content -LiteralPath $resolvedSeedCheckpointPath -Raw | ConvertFrom-Json
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$repositoryCommit = (git -C $repositoryRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $repositoryCommit -notmatch '^[0-9a-f]{40}$') { throw 'Unable to resolve the current repository commit.' }
$null = Assert-TokenomicsSyncContract -Config $config -ConfigFingerprint $configFingerprint -FabricMetadata $fabricMetadata -SeedCheckpoint $seedCheckpoint -RepositoryCommit $repositoryCommit -CurrentTime ([DateTimeOffset]::UtcNow) -MaximumCheckpointAgeMinutes $MaximumCheckpointAgeMinutes
git -C $repositoryRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { throw 'Unable to refresh origin/main before Fabric synchronization.' }
git -C $repositoryRoot merge-base --is-ancestor $repositoryCommit origin/main
if ($LASTEXITCODE -ne 0) { throw 'The Cosmos-verified repository commit is not reachable from origin/main.' }
$trackedChanges = @(git -C $repositoryRoot status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0 -or $trackedChanges.Count -gt 0) {
    throw 'Fabric synchronization requires a clean tracked worktree matching the Cosmos-verified commit.'
}
$seedDirectory = Join-Path $repositoryRoot '.generated/tokenomics/seed'
$stagingDirectory = Join-Path $repositoryRoot '.generated/tokenomics/staging/Tables'
$msftCheckpointPath = Join-Path $repositoryRoot '.generated/tokenomics/msft-export.json'
Invoke-FabricNative -FilePath 'node' -ArgumentList @(
    (Join-Path $PSScriptRoot 'tokenomics/generate-data.mjs'),
    '--config', $ConfigPath,
    '--output', $seedDirectory
) -Description 'Tokenomics snapshot generation'
& (Join-Path $PSScriptRoot 'export-tokenomics-loganalytics.ps1') -ConfigPath $ConfigPath -OutputPath (Join-Path $seedDirectory 'consumption/msft_log_analytics.json') -CheckpointPath $msftCheckpointPath | Out-Null
$msftCheckpoint = Get-Content -LiteralPath $msftCheckpointPath -Raw | ConvertFrom-Json
if ([string]$msftCheckpoint.configFingerprint -ne $configFingerprint -or
    [string]$msftCheckpoint.workspaceResourceId -ne [string]$config.tokenomicsPlatform.logAnalytics.workspaceResourceId -or
    [string]$msftCheckpoint.payloadSha256 -ne (Get-FileHash -LiteralPath (Join-Path $seedDirectory 'consumption/msft_log_analytics.json') -Algorithm SHA256).Hash.ToLowerInvariant() -or
    [int]$msftCheckpoint.recordCount -lt 0) {
    throw 'The Microsoft Foundry telemetry export checkpoint is invalid.'
}
$manifest = Get-Content -LiteralPath (Join-Path $seedDirectory 'manifest.json') -Raw | ConvertFrom-Json
if ([string]$manifest.event_set_sha256 -ne [string]$seedCheckpoint.eventSetSha256 -or
    [int]$manifest.record_count -ne [int]$seedCheckpoint.recordCount -or
    [int64]$manifest.request_count -ne [int64]$seedCheckpoint.requestCount -or
    [int64]$manifest.total_tokens -ne [int64]$seedCheckpoint.totalTokens) {
    throw 'The local Fabric snapshot does not match the rows verified in Cosmos DB.'
}

$venvRoot = Join-Path $repositoryRoot '.generated/tokenomics/fabric-venv'
$venvPython = Join-Path $venvRoot 'Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython -PathType Leaf)) {
    & python -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create the Tokenomics Fabric synchronization environment.' }
}
Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
    '-m', 'pip', 'install', '--disable-pip-version-check', '--quiet',
    '-r', (Join-Path $PSScriptRoot 'requirements-tokenomics-fabric.txt')
) -Description 'Tokenomics Fabric dependency installation'

if (Test-Path -LiteralPath $stagingDirectory) { Remove-Item -LiteralPath $stagingDirectory -Recurse -Force }
Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
    (Join-Path $PSScriptRoot 'tokenomics/generate-delta-tables.py'),
    '--config', $ConfigPath,
    '--seed', $seedDirectory,
    '--staging', $stagingDirectory
) -Description 'Tokenomics source Delta materialization'
Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
    (Join-Path $PSScriptRoot 'tokenomics/materialize-all-ml-tables.py'),
    '--config', $ConfigPath,
    '--seed', $seedDirectory,
    '--staging', $stagingDirectory
) -Description 'Tokenomics reporting Delta materialization'
$deploymentId = ([string]$manifest.event_set_sha256).Substring(0, 16)
$transactionPath = Join-Path $repositoryRoot '.generated/tokenomics/onelake-transaction.json'
if (Test-Path -LiteralPath $transactionPath -PathType Leaf) {
    $priorTransaction = Get-Content -LiteralPath $transactionPath -Raw | ConvertFrom-Json
    $recoveryOperation = if ([string]$priorTransaction.phase -in @('accepted', 'finalizing')) { 'finalize' } else { 'rollback' }
    Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'tokenomics/upload-staging-to-onelake.py'),
        '--fabric-metadata', $resolvedFabricMetadataPath,
        '--staging', $stagingDirectory,
        '--deployment-id', ([string]$priorTransaction.deploymentId),
        '--transaction-path', $transactionPath,
        '--operation', $recoveryOperation
    ) -Description "Prior Tokenomics OneLake transaction $recoveryOperation"
}
Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
    (Join-Path $PSScriptRoot 'tokenomics/upload-staging-to-onelake.py'),
    '--fabric-metadata', $resolvedFabricMetadataPath,
    '--staging', $stagingDirectory,
    '--deployment-id', $deploymentId,
    '--transaction-path', $transactionPath,
    '--operation', 'swap'
) -Description 'Tokenomics OneLake staged swap'

Add-Type -AssemblyName System.Data
$sqlToken = Get-FabricAzAccessToken -TenantId ([string]$config.azure.tenantId) -SubscriptionId ([string]$config.azure.subscriptionId) -Resource 'https://database.windows.net/'
$requiredTables = @($config.tokenomicsPlatform.fabric.reportingTables.PSObject.Properties.Value) + @($config.tokenomicsPlatform.fabric.mlUseCases.outputTableName)
$expectedRowCount = [int64]$manifest.record_count + [int64]$msftCheckpoint.recordCount
$expectedRequestCount = [int64]$manifest.request_count + [int64]$msftCheckpoint.requestCount
$expectedTotalTokens = [int64]$manifest.total_tokens + [int64]$msftCheckpoint.totalTokens
$summary = $null
$lastError = $null
try {
    for ($attempt = 1; $attempt -le 60; $attempt++) {
        $connection = [System.Data.SqlClient.SqlConnection]::new("Server=tcp:$($fabricMetadata.sqlEndpointConnectionString),1433;Initial Catalog=$($config.tokenomicsPlatform.fabric.lakehouseName);Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;")
        $connection.AccessToken = $sqlToken
        try {
            $connection.Open()
            $command = $connection.CreateCommand()
            $command.CommandTimeout = 120
            $command.CommandText = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'ml'; SELECT COUNT_BIG(*) AS row_count, SUM(CAST(request_count AS bigint)) AS request_count, SUM(CAST(total_tokens AS bigint)) AS total_tokens FROM ml.tokenomics_usage_fact;"
            $reader = $command.ExecuteReader()
            $availableTables = @()
            while ($reader.Read()) { $availableTables += [string]$reader['TABLE_NAME'] }
            $null = $reader.NextResult()
            if ($reader.Read()) {
                $summary = [pscustomobject]@{
                    RowCount = [int64]$reader['row_count']
                    RequestCount = [int64]$reader['request_count']
                    TotalTokens = [int64]$reader['total_tokens']
                }
            }
            $reader.Dispose()
            $missingTables = @($requiredTables | Where-Object { $availableTables -notcontains [string]$_ })
            if ($missingTables.Count -eq 0 -and
                $summary.RowCount -eq $expectedRowCount -and
                $summary.RequestCount -eq $expectedRequestCount -and
                $summary.TotalTokens -eq $expectedTotalTokens) {
                $lastError = $null
                break
            }
            $lastError = "missing tables: $($missingTables -join ', '); rows=$($summary.RowCount); requests=$($summary.RequestCount); tokens=$($summary.TotalTokens)"
        }
        catch { $lastError = $_.Exception.Message }
        finally { $connection.Dispose() }
        if ($attempt -lt 60) { Wait-Delay -Seconds 10 }
    }
    if ($lastError) { throw "Fabric SQL endpoint did not expose the Cosmos-verified snapshot: $lastError" }
}
catch {
    if (Test-Path -LiteralPath $transactionPath -PathType Leaf) {
        Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'tokenomics/upload-staging-to-onelake.py'),
            '--fabric-metadata', $resolvedFabricMetadataPath,
            '--staging', $stagingDirectory,
            '--deployment-id', $deploymentId,
            '--transaction-path', $transactionPath,
            '--operation', 'rollback'
        ) -Description 'Tokenomics OneLake SQL-rejection rollback'
    }
    throw
}
finally {
    $sqlToken = $null
}

Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
    (Join-Path $PSScriptRoot 'tokenomics/upload-staging-to-onelake.py'),
    '--fabric-metadata', $resolvedFabricMetadataPath,
    '--staging', $stagingDirectory,
    '--deployment-id', $deploymentId,
    '--transaction-path', $transactionPath,
    '--operation', 'accept'
) -Description 'Tokenomics OneLake snapshot acceptance'
Invoke-FabricNative -FilePath $venvPython -ArgumentList @(
    (Join-Path $PSScriptRoot 'tokenomics/upload-staging-to-onelake.py'),
    '--fabric-metadata', $resolvedFabricMetadataPath,
    '--staging', $stagingDirectory,
    '--deployment-id', $deploymentId,
    '--transaction-path', $transactionPath,
    '--operation', 'finalize'
) -Description 'Tokenomics OneLake accepted-snapshot finalization'

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
[ordered]@{
    schemaVersion = 1
    synchronizedAt = [DateTimeOffset]::UtcNow.ToString('o')
    configFingerprint = $configFingerprint
    cosmosEventSetSha256 = [string]$manifest.event_set_sha256
    microsoftTelemetrySha256 = [string]$msftCheckpoint.payloadSha256
    microsoftTelemetryRecordCount = [int]$msftCheckpoint.recordCount
    workspaceId = [string]$fabricMetadata.workspaceId
    lakehouseId = [string]$fabricMetadata.lakehouseId
    rowCount = [int64]$summary.RowCount
    requestCount = [int64]$summary.RequestCount
    totalTokens = [int64]$summary.TotalTokens
    reportingTableCount = $requiredTables.Count
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $resolvedOutputPath -Encoding utf8
Get-Content -LiteralPath $resolvedOutputPath -Raw | ConvertFrom-Json