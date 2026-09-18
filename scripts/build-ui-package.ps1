[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $IdentityPath = (Join-Path $PSScriptRoot '../.generated/identity.json'),
    [string] $OutputPath = (Join-Path $PSScriptRoot '../.generated/packages/fabric-costops-ui.zip'),
    [switch] $SkipInstall
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$fabricRoot = Split-Path -Parent $PSScriptRoot
$uiRoot = Join-Path $fabricRoot 'ui'
$stageRoot = Join-Path $fabricRoot '.generated/packages/ui-stage'
$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$build = & (Join-Path $PSScriptRoot 'build-ui.ps1') -ConfigPath $ConfigPath -IdentityPath $IdentityPath -ApiBaseUrl "/api/$($config.apim.tokenomicsApiPath)" -SkipInstall:$SkipInstall

Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $stageRoot 'browser') -Force | Out-Null
Copy-Item -Path (Join-Path $build.OutputPath '*') -Destination (Join-Path $stageRoot 'browser') -Recurse
Copy-Item -LiteralPath (Join-Path $uiRoot 'server.js') -Destination $stageRoot
Copy-Item -LiteralPath (Join-Path $uiRoot 'host-package.json') -Destination (Join-Path $stageRoot 'package.json')

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { throw 'Python 3 is required to create a portable deployment ZIP.' }
Invoke-FabricNative -FilePath $python.Source -ArgumentList @(
    (Join-Path $PSScriptRoot 'create_zip.py'),
    $stageRoot,
    $resolvedOutputPath,
    '--require',
    'package.json',
    '--require',
    'server.js',
    '--require',
    'browser/index.html'
) -Description 'UI deployment ZIP creation'
$archive = Get-Item -LiteralPath $resolvedOutputPath
$hash = Get-FileHash -LiteralPath $resolvedOutputPath -Algorithm SHA256
[pscustomobject]@{
    PackagePath = $archive.FullName
    SizeBytes = $archive.Length
    Sha256 = $hash.Hash.ToLowerInvariant()
}