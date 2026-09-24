[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $OutputPath = (Join-Path $PSScriptRoot '../.generated/packages/fabric-tokenomics-api.zip')
)

# Builds a code (non-container) deployment package for the Tokenomics FastAPI
# service, hosted on an Azure App Service (Linux, Python) plan via Oryx build.
$ErrorActionPreference = 'Stop'
$fabricRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $fabricRoot 'api'
$stage = Join-Path $fabricRoot '.generated/packages/api-stage'
$resolvedOutput = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path (Join-Path $stage 'config') -Force | Out-Null

Copy-Item -Path (Join-Path $apiRoot 'app') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $apiRoot 'requirements.txt') -Destination $stage
Copy-Item -LiteralPath $ConfigPath -Destination (Join-Path $stage 'config/deployment.json')
Copy-Item -LiteralPath (Join-Path $fabricRoot 'config/tokenomics-prompts.json') -Destination (Join-Path $stage 'config/tokenomics-prompts.json')

# startup.sh must use LF line endings for bash.
$startup = Get-Content -LiteralPath (Join-Path $apiRoot 'startup.sh') -Raw
$startup = $startup -replace "`r`n", "`n"
[System.IO.File]::WriteAllText((Join-Path $stage 'startup.sh'), $startup)

# Drop any __pycache__ from the staged app.
Get-ChildItem -LiteralPath $stage -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutput) -Force | Out-Null
Remove-Item -LiteralPath $resolvedOutput -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $resolvedOutput -Force

$archive = Get-Item -LiteralPath $resolvedOutput
[pscustomobject]@{ PackagePath = $archive.FullName; SizeBytes = $archive.Length }
