# Fabric Tokenomics FastAPI Service

A Python **FastAPI** service that serves live multi-cloud AI tokenomics directly
from the **Microsoft Fabric Lakehouse** (`lh_tokenomics`) SQL analytics endpoint.
It replaces the UI's mock data with real Gold-layer facts and exposes the Power BI
embed configuration for the dashboards built on the same OneLake tables.

## Design principles

- **No hard-coded values.** Everything (SQL endpoint host, table names, provider
  display names, Power BI report/dashboard IDs, CORS origins, window options)
  is read from [`config/deployment.json`](../config/deployment.json) under the
  `dashboardApi` and `powerBi` sections, plus the generated Fabric metadata in
  `.generated/tokenomics/fabric.json`.
- **Passwordless auth.** Uses `DefaultAzureCredential` to obtain an Entra ID
  token for the Fabric SQL endpoint — Azure CLI login locally, managed identity
  in Azure App Service. No secrets are stored.

## Endpoints

| Method | Path             | Description                                             |
|--------|------------------|---------------------------------------------------------|
| GET    | `/health`        | Liveness + Fabric connectivity probe                    |
| GET    | `/summary`       | `TokenomicsDashboard` for `?days=1\|7\|30\|90`           |
| GET    | `/pricing`       | Current multi-cloud model rate cards                    |
| GET    | `/pricing/consumption` | Total consumption cost for `?days=1\|7\|30\|90`: token usage joined to the `prices` history; Copilot Studio costed from stored USD || GET    | `/actions`       | Data-driven FinOps action plans for `?days=1\|7\|30\|90` |
| GET    | `/powerbi/embed` | Power BI report + dashboard embed configuration         |

The `/summary` response matches the `TokenomicsDashboard` TypeScript contract
consumed by the Angular UI (`ui/src/app/tokenomics.model.ts`).

## Data sources

- `ml.tokenomics_usage_fact` — summary, trend, allocations, models, operations,
  recent requests.
- `<provider>.token_consumption` — best-effort p95 latency.
- `config.powerBi.*` — Power BI embed IDs and URLs.

## Provider labels

Usage and price rows carry a PascalCase `Provider` label. Azure AI Foundry (token-billed) and
Microsoft Copilot Studio (AI-credit-billed) both use `source_code` `msft`, so `service_code` picks the label.

| `source_code` | `service_code`             | `Provider` label         |
|---------------|----------------------------|--------------------------|
| `msft`        | `copilot-studio`           | Microsoft Copilot Studio |
| `msft`        | `azure-ai-foundry` or null | Azure AI Foundry         |
| `aws`         | any                        | AWS Bedrock              |
| `gcp`         | any                        | GCP Vertex AI            |
| `oai`         | any                        | OpenAI Direct            |
| `cld`         | any                        | Anthropic Claude         |

Names come from `dashboardApi.providers` and `dashboardApi.serviceProviders` in
[`config/deployment.json`](../config/deployment.json). When `serviceProviders` is absent, the two
Microsoft labels above are the fallback.

## AI credits (Microsoft Copilot Studio)

Copilot Studio rows (`service_code` `copilot-studio`, `consumption_unit` `ai_credits`) carry no token
telemetry. Their dollars are `ai_credits` × `credit_unit_price_usd`, stored in `market_cost_usd` and
`negotiated_cost_usd`. The `TokenomicsRow` objects in `trend`, `allocations`, `models`, and
`recentRequests` expose these fields:

| Field                | Meaning                                                                   |
|----------------------|---------------------------------------------------------------------------|
| `ServiceCode`        | `azure-ai-foundry`, `copilot-studio`, or null for non-Microsoft rows      |
| `ConsumptionUnit`    | `tokens` or `ai_credits`                                                  |
| `AiCredits`          | Credits consumed (null on token-only rows)                                |
| `CreditUnitPriceUsd` | Credit-weighted USD per credit, four decimals                             |
| `AgentId`            | Copilot Studio agent name or token-row agent id (set on `recentRequests`) |

`allocations` and `models` group by `service_code`, so the two Microsoft products never merge. They are
not split by agent, which keeps their row counts unchanged.

Totals: `summary.aiCredits`. `summary.tokenizedRequests` and `tokenCoveragePct` count token-billed
requests only. `/pricing/consumption` returns `aiCredits`, `/users/consumption` returns `aiCredits` per
user plus `totalAiCredits`, and `/users/segmentation` clusters return `totalAiCredits`.

## Agent tools

[`app/agent_tools.py`](app/agent_tools.py) declares the tools in `tool_definitions()` and maps each name
to its handler in `handlers()`. A test fails if the two lists differ.

| Tool | Purpose |
|---|---|
| `get_spend_summary`, `get_top_models`, `get_cost_by_dimension` | Totals and rankings with `aiCredits`. The `provider` dimension reports the two Microsoft products separately. |
| `get_consumption_cost` | Token usage re-priced from the price history; Copilot Studio costed from stored USD. |
| `get_model_pricing`, `get_price_changes` | Token rate cards and price history (`prices.token_price_history`). |
| `get_ai_credit_rates` | Current Copilot Studio rates (list, negotiated, prepaid pack) from `prices.ai_credit_price_history` where `is_current = 1`. The table name can be overridden with `dashboardApi.aiCreditPriceTable`. |

Provider codes are `aws`, `gcp`, `msft`, `oai`, `cld`, and `cps`. `msft` covers both Microsoft products.
`cps` is the alias for Copilot Studio. `get_ai_credit_rates` translates it to
`source_code = 'msft' AND service_code = 'copilot-studio'`. The token price tables have no `service_code`,
so `get_model_pricing` and `get_price_changes` return no rows for `cps` and a note that points to
`get_ai_credit_rates`.

## Run locally

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
az login                      # provides the token for the Fabric SQL endpoint
uvicorn app.main:app --port 8080
```

Then:

```powershell
curl http://localhost:8080/health
curl "http://localhost:8080/summary?days=30"
curl http://localhost:8080/powerbi/embed
```

## Configuration overrides

See [`.env.example`](.env.example). All overrides are optional; by default the
service resolves config relative to the repository root.

## Docker

```powershell
docker build -t fabric-tokenomics-api ./api
docker run -p 8080:8080 -v ${PWD}/config:/config:ro `
  -e TOKENOMICS_CONFIG_PATH=/config/deployment.json fabric-tokenomics-api
```

## Tests

```powershell
cd api
pip install -r requirements-dev.txt
pytest
```
