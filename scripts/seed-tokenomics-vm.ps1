param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{7,40}$')]
    [string] $RepositoryCommit
)

$ErrorActionPreference = 'Stop'
$work = 'C:\TokenomicsSeed'
if (Test-Path $work) {
    Remove-Item $work -Recurse -Force
}
New-Item -ItemType Directory -Path $work | Out-Null

try {
    $shasums = Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt'
    $archiveMatch = [regex]::Match($shasums.Content, '(?m)^([0-9a-f]+)\s+(node-v22[^\s]+-win-x64\.zip)$')
    $expectedHash = $archiveMatch.Groups[1].Value
    $archiveName = $archiveMatch.Groups[2].Value
    if ([string]::IsNullOrWhiteSpace($archiveName)) {
        throw 'Unable to resolve the latest Node 22 archive.'
    }
    $nodeZip = Join-Path $work $archiveName
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/latest-v22.x/$archiveName" -OutFile $nodeZip
    $actualHash = (Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw 'Portable Node 22 archive checksum verification failed.'
    }
    Expand-Archive -LiteralPath $nodeZip -DestinationPath $work -Force
    $nodeRoot = (Get-ChildItem $work -Directory | Where-Object { $_.Name -like 'node-v22*-win-x64' } | Select-Object -First 1).FullName
    if (-not $nodeRoot) {
        throw 'Portable Node 22 was not extracted.'
    }
    $env:Path = "$nodeRoot;$env:Path"

    $repoZip = Join-Path $work 'repo.zip'
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/csdmichael/FabricIQ-FoundryIQ-CostOps/archive/$RepositoryCommit.zip" -OutFile $repoZip
    Expand-Archive -LiteralPath $repoZip -DestinationPath $work -Force
    $repo = (Get-ChildItem $work -Directory | Where-Object { $_.Name -like 'FabricIQ-FoundryIQ-CostOps-*' } | Select-Object -First 1).FullName
    if (-not $repo) {
        throw 'Repository archive was not extracted.'
    }

    $toolRoot = Join-Path $repo 'scripts\tokenomics'
    $log = Join-Path $work 'seed.log'
    & npm.cmd ci --prefix $toolRoot *> $log
    if ($LASTEXITCODE -ne 0) {
        throw "Tokenomics dependency installation failed. $((Get-Content $log -Tail 20) -join ' ')"
    }
    & npm.cmd test --prefix $toolRoot *> $log
    if ($LASTEXITCODE -ne 0) {
        throw "Tokenomics generator tests failed. $((Get-Content $log -Tail 20) -join ' ')"
    }
    & node.exe (Join-Path $toolRoot 'seed-data.mjs') --config (Join-Path $repo 'config\deployment.json')
    if ($LASTEXITCODE -ne 0) {
        throw 'Tokenomics private seed failed.'
    }
}
finally {
    if (Test-Path $work) {
        Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
