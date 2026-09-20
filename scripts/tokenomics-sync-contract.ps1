Set-StrictMode -Version Latest

function Assert-TokenomicsSyncContract {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [object] $Config,
        [Parameter(Mandatory = $true)] [string] $ConfigFingerprint,
        [Parameter(Mandatory = $true)] [object] $FabricMetadata,
        [Parameter(Mandatory = $true)] [object] $SeedCheckpoint,
        [Parameter(Mandatory = $true)] [ValidatePattern('^[0-9a-f]{40}$')] [string] $RepositoryCommit,
        [Parameter(Mandatory = $true)] [DateTimeOffset] $CurrentTime,
        [Parameter(Mandatory = $true)] [ValidateRange(15, 1440)] [int] $MaximumCheckpointAgeMinutes
    )

    if ([string]$FabricMetadata.configFingerprint -ne $ConfigFingerprint -or
        [string]$FabricMetadata.workspaceName -ne [string]$Config.tokenomicsPlatform.fabric.workspaceName -or
        [string]$FabricMetadata.lakehouseName -ne [string]$Config.tokenomicsPlatform.fabric.lakehouseName -or
        [string]$FabricMetadata.capacityId -ne [string]$Config.tokenomicsPlatform.fabric.capacityId) {
        throw 'The Fabric metadata does not match the active deployment configuration. Re-run tokenomics-fabric.'
    }
    $null = Assert-FabricGuid -Value $FabricMetadata.workspaceId -Name 'fabricMetadata.workspaceId'
    $null = Assert-FabricGuid -Value $FabricMetadata.lakehouseId -Name 'fabricMetadata.lakehouseId'

    if ([string]$SeedCheckpoint.configFingerprint -ne $ConfigFingerprint) {
        throw 'The Cosmos seed checkpoint does not match the active deployment configuration. Re-run tokenomics-seed.'
    }
    $verifiedAt = [DateTimeOffset]::MinValue
    if (-not [DateTimeOffset]::TryParse([string]$SeedCheckpoint.verifiedAt, [ref]$verifiedAt) -or
        ($CurrentTime.ToUniversalTime() - $verifiedAt.ToUniversalTime()) -gt [TimeSpan]::FromMinutes($MaximumCheckpointAgeMinutes)) {
        throw "The Cosmos seed checkpoint is older than $MaximumCheckpointAgeMinutes minutes. Re-run tokenomics-seed."
    }
    if ([string]$SeedCheckpoint.repositoryCommit -ne $RepositoryCommit) {
        throw 'The Cosmos seed checkpoint was not produced from the current repository commit.'
    }
    if ([string]$SeedCheckpoint.eventSetSha256 -notmatch '^[0-9a-f]{64}$') {
        throw 'The Cosmos seed checkpoint event-set fingerprint is invalid.'
    }

    return [pscustomobject]@{
        WorkspaceId = [string]$FabricMetadata.workspaceId
        LakehouseId = [string]$FabricMetadata.lakehouseId
        EventSetSha256 = [string]$SeedCheckpoint.eventSetSha256
    }
}