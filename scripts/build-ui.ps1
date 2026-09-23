[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $IdentityPath = (Join-Path $PSScriptRoot '../.generated/identity.json'),
    [string] $ApiBaseUrl,
    [switch] $SkipInstall
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$fabricRoot = Split-Path -Parent $PSScriptRoot
$uiDirectory = Join-Path $fabricRoot 'ui'
$runtimeConfigPath = Join-Path $uiDirectory 'public/runtime-config.json'
$originalRuntimeConfig = Get-Content -LiteralPath $runtimeConfigPath -Raw

$resolvedIdentityPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($IdentityPath)
$dashboardClientId = 'ebef5cd8-07ed-4889-85b6-348df351f68b'
$resourceApiClientId = '3a9e9b7d-7354-4efd-b724-d9f566c67fd1'

if (Test-Path -LiteralPath $resolvedIdentityPath -PathType Leaf) {
    $identity = Get-Content -LiteralPath $resolvedIdentityPath -Raw | ConvertFrom-Json
    if ($identity.dashboardClient -and $identity.dashboardClient.clientId) {
        $dashboardClientId = $identity.dashboardClient.clientId
    }
    if ($identity.resourceApi -and $identity.resourceApi.clientId) {
        $resourceApiClientId = $identity.resourceApi.clientId
    }
}

$effectiveApiBaseUrl = if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    "$($config.apim.gatewayUrl.TrimEnd('/'))/$($config.apim.tokenomicsApiPath)"
}
else {
    $ApiBaseUrl.TrimEnd('/')
}
$runtimeConfig = [ordered]@{
    apiBaseUrl = $effectiveApiBaseUrl
    tenantId = [string]$config.identity.resourceTenantId
    clientId = $dashboardClientId
    scope = "api://$resourceApiClientId/$($config.identity.delegatedScope)"
    environment = [string]$config.ui.environment
    powerBiScope = [string]$config.identity.powerBiApiScope
}

try {
    $runtimeConfig | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $runtimeConfigPath -Encoding utf8
    if (-not $SkipInstall) {
        Invoke-FabricNative -FilePath 'npm' -ArgumentList @('ci', '--prefix', $uiDirectory) -Description 'UI dependency installation'
    }
    Invoke-FabricNative -FilePath 'npm' -ArgumentList @('run', 'build', '--prefix', $uiDirectory) -Description 'UI production build'
}
finally {
    Set-Content -LiteralPath $runtimeConfigPath -Value $originalRuntimeConfig -Encoding utf8 -NoNewline
}

[pscustomobject]@{
    Mode = 'Live'
    OutputPath = Join-Path $uiDirectory 'dist/fabric-tokenomics/browser'
    RuntimeConfigIncluded = $true
}