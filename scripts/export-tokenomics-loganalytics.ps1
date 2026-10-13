[CmdletBinding()]
param(
    [string] $ConfigPath = (Join-Path $PSScriptRoot '../config/deployment.json'),
    [string] $OutputPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/seed/consumption/msft_log_analytics.json'),
    [string] $CheckpointPath = (Join-Path $PSScriptRoot '../.generated/tokenomics/msft-export.json')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'config.ps1')

$config = Get-FabricDeploymentConfig -Path $ConfigPath
$workspaceResourceId = [string]$config.tokenomicsPlatform.logAnalytics.workspaceResourceId
$lookbackDays = [int]$config.tokenomicsPlatform.logAnalytics.lookbackDays
$apiIds = @(
    [string]$config.apim.tokenomicsApiId
)
$apiIdsJson = ConvertTo-Json -InputObject $apiIds -Compress
$apiAttributionJson = ConvertTo-Json -InputObject ([ordered]@{
    ([string]$config.apim.tokenomicsApiId) = [string]$config.fabric.dataAgentName
}) -Compress
$workspaceId = az monitor log-analytics workspace show --ids $workspaceResourceId --query customerId -o tsv
if ($LASTEXITCODE -ne 0 -or $workspaceId -notmatch '^[0-9a-fA-F-]{36}$') {
    throw 'Unable to resolve the configured Log Analytics workspace customer ID.'
}

$query = @"
let ApiIds = dynamic($apiIdsJson);
let ApiAttribution = dynamic($apiAttributionJson);
let ScopedRequests = materialize(
    ApiManagementGatewayLogs
    | where TimeGenerated >= ago(${lookbackDays}d)
    | where set_has_element(ApiIds, tostring(ApiId))
    | summarize arg_max(TimeGenerated, *) by CorrelationId
    | project CorrelationId=tostring(CorrelationId), ApiId=tostring(ApiId), OperationId=tostring(OperationId)
);
let ScopedTokens = materialize(
    ApiManagementGatewayLlmLog
    | where TimeGenerated >= ago(${lookbackDays}d) and TotalTokens > 0
    | project TimeGenerated, CorrelationId=tostring(CorrelationId), ModelName=tostring(ModelName),
        PromptTokens=tolong(PromptTokens), CompletionTokens=tolong(CompletionTokens), TotalTokens=tolong(TotalTokens),
        IsStreamCompletion=tobool(IsStreamCompletion)
    | join kind=inner ScopedRequests on CorrelationId
);
ScopedTokens
| extend NormalizedModel = replace_regex(tostring(ModelName), @'-\d{4}-\d{2}-\d{2}$', '')
| project
    id = strcat('msft-', substring(hash_sha256(strcat(tostring(TimeGenerated), '|', tostring(CorrelationId))), 0, 24)),
    event_id = strcat('msft-', hash_sha256(strcat(tostring(TimeGenerated), '|', tostring(CorrelationId)))),
    event_ts = tostring(TimeGenerated),
    usage_date = format_datetime(startofday(TimeGenerated), 'yyyy-MM-dd'),
    ingested_at = tostring(TimeGenerated),
    source_code = 'msft', account_id = 'azure', region = '',
    request_id = tostring(CorrelationId), correlation_id = tostring(CorrelationId),
    model_family = NormalizedModel, model_name = NormalizedModel, model_version = '', deployment_id = NormalizedModel,
    user_id_hash = 'unattributed', team_id = 'unassigned', department_id = 'unassigned', business_unit_id = 'unassigned',
    cost_center_id = 'unassigned', project_id = '$([string]$config.tokenomics.projectId)', application_id = ApiId,
    agent_id = tostring(ApiAttribution[ApiId]), environment = 'customer',
    task_id = '', task_type = 'inference', prompt_template_id = '', request_count = long(1),
    input_tokens = tolong(PromptTokens), cached_input_tokens = long(0), cache_write_tokens = long(0),
    output_tokens = tolong(CompletionTokens), total_tokens = tolong(TotalTokens), context_window_tokens = long(0),
    tool_call_count = long(0), tool_success_count = long(0), retry_count = long(0), failure_count = long(0), latency_ms = long(0), status_code = long(200),
    is_stream = tobool(IsStreamCompletion), currency = 'USD', reported_cost_usd = real(0), service_code = 'azure-ai-foundry', consumption_unit = 'tokens', ai_credits = real(0), credit_unit_price_usd = real(0), tasks_completed = long(0),
    hours_saved = real(0), tickets_reduced = long(0), code_generated_lines = long(0), quality_score = real(0), prompt_char_count = long(0), is_anomaly_seed = false,
    __expected_row_count = tolong(toscalar(ScopedTokens | count))
| order by event_ts asc, event_id asc
"@

$token = Get-FabricAzAccessToken -TenantId ([string]$config.azure.tenantId) -SubscriptionId ([string]$config.azure.subscriptionId) -Resource 'https://api.loganalytics.io/'
try {
    $response = Invoke-RestMethod -Method POST -Uri "https://api.loganalytics.io/v1/workspaces/$workspaceId/query" -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body (@{
        query = $query
        timespan = "P${lookbackDays}D"
        statistics = $true
    } | ConvertTo-Json -Compress)
}
finally { $token = $null }

$partialError = $response.PSObject.Properties['error']
if ($null -ne $partialError) {
    throw "The Microsoft Foundry Log Analytics query returned a partial result: $($partialError.Value | ConvertTo-Json -Depth 20 -Compress)"
}

$table = @($response.tables)[0]
if ($null -eq $table -or @($table.columns).Count -eq 0) {
    throw 'The configured Microsoft Foundry Log Analytics query returned no result schema.'
}
$columnNames = @($table.columns | ForEach-Object { [string]$_.name })
$expectedCountIndex = [Array]::IndexOf($columnNames, '__expected_row_count')
if ($expectedCountIndex -lt 0) { throw 'The Microsoft Foundry Log Analytics result omitted its completeness marker.' }
$expectedRowCount = if (@($table.rows).Count -eq 0) { 0 } else { [int64]$table.rows[0][$expectedCountIndex] }
if ($expectedRowCount -ne @($table.rows).Count) {
    throw "The Microsoft Foundry Log Analytics result is incomplete: expected $expectedRowCount rows but received $(@($table.rows).Count)."
}
$records = @($table.rows | ForEach-Object {
    $row = $_
    $record = [ordered]@{}
    for ($index = 0; $index -lt $columnNames.Count; $index++) {
        if ($index -ne $expectedCountIndex) { $record[$columnNames[$index]] = $row[$index] }
    }
    [pscustomobject]$record
})

$resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
$resolvedCheckpointPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($CheckpointPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedOutputPath) -Force | Out-Null
$temporaryOutputPath = "$resolvedOutputPath.tmp"
ConvertTo-Json -InputObject $records -Depth 10 -Compress | Set-Content -LiteralPath $temporaryOutputPath -Encoding utf8
Move-Item -LiteralPath $temporaryOutputPath -Destination $resolvedOutputPath -Force

$requestCount = if ($records.Count -eq 0) { 0 } else { [int64](($records | Measure-Object -Property request_count -Sum).Sum) }
$totalTokens = if ($records.Count -eq 0) { 0 } else { [int64](($records | Measure-Object -Property total_tokens -Sum).Sum) }
$checkpoint = [ordered]@{
    schemaVersion = 1
    exportedAt = [DateTimeOffset]::UtcNow.ToString('o')
    configFingerprint = Get-FabricConfigFingerprint -Path $ConfigPath
    workspaceResourceId = $workspaceResourceId
    apiIds = $apiIds
    lookbackDays = $lookbackDays
    payloadSha256 = (Get-FileHash -LiteralPath $resolvedOutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    recordCount = $records.Count
    requestCount = $requestCount
    totalTokens = $totalTokens
}
New-Item -ItemType Directory -Path (Split-Path -Parent $resolvedCheckpointPath) -Force | Out-Null
$temporaryCheckpointPath = "$resolvedCheckpointPath.tmp"
$checkpoint | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporaryCheckpointPath -Encoding utf8
Move-Item -LiteralPath $temporaryCheckpointPath -Destination $resolvedCheckpointPath -Force
[pscustomobject]$checkpoint