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
| GET    | `/actions`       | Data-driven FinOps action plans for `?days=1\|7\|30\|90` |
| GET    | `/powerbi/embed` | Power BI report + dashboard embed configuration         |

The `/summary` response matches the `TokenomicsDashboard` TypeScript contract
consumed by the Angular UI (`ui/src/app/tokenomics.model.ts`).

## Data sources

- `ml.tokenomics_usage_fact` — summary, trend, allocations, models, operations,
  recent requests.
- `<provider>.token_consumption` — best-effort p95 latency.
- `config.powerBi.*` — Power BI embed IDs and URLs.

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
