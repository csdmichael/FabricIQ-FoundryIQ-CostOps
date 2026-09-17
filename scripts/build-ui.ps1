[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $IdentityPath = (Join-Path $PSScriptRoot '../.generated/identity.json'),
    [switch] $Demo,
    [switch] $SkipInstall
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$fabricRoot = Split-Path -Parent $PSScriptRoot
$uiDirectory = Join-Path $fabricRoot 'ui'
$runtimeConfigPath = Join-Path $uiDirectory 'public/runtime-config.json'
$originalRuntimeConfig = Get-Content -LiteralPath $runtimeConfigPath -Raw

if ($Demo) {
    $runtimeConfig = [ordered]@{
        apiBaseUrl = ''
        tenantId = ''
        clientId = ''
        scope = ''
        demoMode = $true
        environment = 'Demo'
    }
}
else {
    $resolvedIdentityPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($IdentityPath)
    if (-not (Test-Path -LiteralPath $resolvedIdentityPath -PathType Leaf)) {
        throw "Identity metadata not found: $resolvedIdentityPath. Run provision-identity.ps1 or use -Demo."
    }
    $identity = Get-Content -LiteralPath $resolvedIdentityPath -Raw | ConvertFrom-Json
    if ($identity.schemaVersion -ne 1 -or $identity.configFingerprint -ne (Get-FabricConfigFingerprint -Path $ConfigPath)) {
        throw 'Identity metadata does not match the current deployment configuration.'
    }
    $dashboardClientId = Assert-FabricGuid -Value $identity.dashboardClient.clientId -Name 'identity.dashboardClient.clientId'
    $resourceApiClientId = Assert-FabricGuid -Value $identity.resourceApi.clientId -Name 'identity.resourceApi.clientId'
    $runtimeConfig = [ordered]@{
        apiBaseUrl = "$($config.apim.gatewayUrl.TrimEnd('/'))/$($config.apim.tokenomicsApiPath)"
        tenantId = [string]$config.identity.resourceTenantId
        clientId = $dashboardClientId
        scope = "api://$resourceApiClientId/$($config.identity.delegatedScope)"
        demoMode = $false
        environment = [string]$config.ui.environment
    }
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
    Mode = if ($Demo) { 'Demo' } else { 'Live' }
    OutputPath = Join-Path $uiDirectory 'dist/fabric-tokenomics/browser'
    RuntimeConfigIncluded = $true
}