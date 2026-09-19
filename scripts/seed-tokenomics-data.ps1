[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $RunnerVmName = 'caldova-jump',
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string] $RepositoryCommit,
    [switch] $KeepRunnerRunning
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$subscriptionId = [string]$config.azure.subscriptionId
$resourceGroup = [string]$config.azure.resourceGroup
$platform = $config.tokenomicsPlatform
$repositoryRoot = Split-Path -Parent $PSScriptRoot
git -C $repositoryRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to refresh origin/main before validating RepositoryCommit.'
}
git -C $repositoryRoot merge-base --is-ancestor $RepositoryCommit origin/main
if ($LASTEXITCODE -ne 0) {
    throw 'RepositoryCommit must already be reachable from origin/main.'
}

$vm = az vm show --subscription $subscriptionId --resource-group $resourceGroup --name $RunnerVmName -o json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $vm.identity.principalId) {
    throw 'The private seed runner must exist and have a system-assigned managed identity.'
}
$runnerPrincipalId = [string]$vm.identity.principalId
$powerState = az vm get-instance-view --subscription $subscriptionId --resource-group $resourceGroup --name $RunnerVmName --query "instanceView.statuses[?starts_with(code, 'PowerState/')].displayStatus" -o tsv
$startedRunner = $powerState -ne 'VM running'
$storageScope = "/subscriptions/$subscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Storage/storageAccounts/$($platform.rawStorage.accountName)"
$storageAssignmentId = $null
$storageAssignmentCreated = $false
$cosmosAssignmentId = [guid]::NewGuid().ToString()
$cosmosAssignmentCreated = $false

try {
    $storageAssignmentId = az role assignment list --subscription $subscriptionId --assignee-object-id $runnerPrincipalId --role 'Storage Blob Data Contributor' --scope $storageScope --query '[0].id' -o tsv
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the seed runner Blob data role.' }
    if ([string]::IsNullOrWhiteSpace($storageAssignmentId)) {
        $storageAssignment = az role assignment create --subscription $subscriptionId --assignee-object-id $runnerPrincipalId --assignee-principal-type ServicePrincipal --role 'Storage Blob Data Contributor' --scope $storageScope -o json | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the temporary Blob data role.' }
        $storageAssignmentId = [string]$storageAssignment.id
        $storageAssignmentCreated = $true
    }

    $cosmosScope = "/dbs/$($platform.cosmos.databaseName)/colls/$($platform.cosmos.containerName)"
    az cosmosdb sql role assignment create --subscription $subscriptionId --resource-group $resourceGroup --account-name $platform.cosmos.accountName --role-assignment-id $cosmosAssignmentId --role-definition-id '00000000-0000-0000-0000-000000000002' --principal-id $runnerPrincipalId --scope $cosmosScope --only-show-errors -o none
    if ($LASTEXITCODE -ne 0) { throw 'Unable to grant the temporary Cosmos data role.' }
    $cosmosAssignmentCreated = $true

    if ($startedRunner) {
        az vm start --subscription $subscriptionId --resource-group $resourceGroup --name $RunnerVmName --only-show-errors -o none
        if ($LASTEXITCODE -ne 0) { throw 'Unable to start the private seed runner.' }
    }

    $remoteScript = Join-Path $PSScriptRoot 'seed-tokenomics-vm.ps1'
    $result = az vm run-command invoke --subscription $subscriptionId --resource-group $resourceGroup --name $RunnerVmName --command-id RunPowerShellScript --scripts "@$remoteScript" --parameters "RepositoryCommit=$RepositoryCommit" -o json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'The private seed runner command failed.' }
    $stdout = [string](@($result.value | Where-Object { $_.code -like '*StdOut*' } | Select-Object -First 1).message).Trim()
    $stderr = [string](@($result.value | Where-Object { $_.code -like '*StdErr*' } | Select-Object -First 1).message).Trim()
    if ($stderr) { throw "The private seed runner reported an error: $stderr" }
    $verification = $stdout | ConvertFrom-Json
    if ([int]$verification.recordCount -ne [int]$platform.syntheticData.recordCount) {
        throw 'The private seed verification count does not match configuration.'
    }
    $verification
}
finally {
    $cleanupFailures = @()
    if ($storageAssignmentCreated -and $storageAssignmentId) {
        az role assignment delete --subscription $subscriptionId --ids $storageAssignmentId 2>$null
        if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'Blob role assignment' }
    }
    if ($cosmosAssignmentCreated) {
        az cosmosdb sql role assignment delete --subscription $subscriptionId --resource-group $resourceGroup --account-name $platform.cosmos.accountName --role-assignment-id $cosmosAssignmentId --yes 2>$null
        if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'Cosmos role assignment' }
    }
    if ($startedRunner -and -not $KeepRunnerRunning) {
        az vm deallocate --subscription $subscriptionId --resource-group $resourceGroup --name $RunnerVmName --only-show-errors -o none 2>$null
        if ($LASTEXITCODE -ne 0) { $cleanupFailures += 'runner deallocation' }
    }
    if ($cleanupFailures.Count -gt 0) {
        throw "Tokenomics seed cleanup failed: $($cleanupFailures -join ', ')."
    }
}
