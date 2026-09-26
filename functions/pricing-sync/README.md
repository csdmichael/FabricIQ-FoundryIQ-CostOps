# Pricing sync Azure Function

Timer-triggered Python (v2 model) Function that keeps the governed
`prices.token_price_history` table fresh in Microsoft Fabric.

## What it does

On each run (schedule from `PRICING_SYNC_SCHEDULE`, default daily at 06:00 UTC) it:

1. Reads current effective prices from the Fabric SQL endpoint (`is_current = 1`).
2. Fetches the latest model rates from the configured provider pricing sources
   (`config/deployment.json` → `tokenomicsPlatform.pricing.sources`).
3. Diffs against the current rates and, for any model whose price changed, closes the
   previous row (`effective_to`, `is_current = false`) and appends a new effective-dated
   row (SCD-2).
4. Writes the updated Delta table to Fabric OneLake via managed identity.

It never stores secrets — `DefaultAzureCredential` resolves the Function's system-assigned
managed identity in Azure. Grant that identity **write** access to the Fabric workspace
OneLake and **read** on the Lakehouse SQL endpoint.

## Files

| File | Purpose |
| --- | --- |
| `function_app.py` | Timer trigger + orchestration. |
| `pricing_sources.py` | Loads + normalizes provider pricing sources. |
| `onelake_writer.py` | Reads current prices (SQL endpoint) and writes SCD-2 changes to OneLake. |
| `host.json`, `requirements.txt` | Functions host config + Python deps. |

## App settings (set by IaC)

`TOKENOMICS_SQL_ENDPOINT_HOST`, `TOKENOMICS_LAKEHOUSE_NAME`, `FABRIC_WORKSPACE_ID`,
`FABRIC_LAKEHOUSE_ID`, `TOKENOMICS_PRICES_SCHEMA`, `TOKENOMICS_PRICES_TABLE`,
`PRICING_SYNC_SCHEDULE`.

## Deploy

Infrastructure (Function App on the existing Linux plan) is provisioned by
[`bicep/pricing-function/main.bicep`](../../bicep/pricing-function/main.bicep) or
[`terraform/pricing-function`](../../terraform/pricing-function). Code is published with
`func azure functionapp publish <appName>` or the `Deploy — infra & ontology` GitHub workflow.
