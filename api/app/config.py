"""Configuration loader for the Tokenomics FastAPI service.

All runtime values are sourced from JSON config files under ``config/`` and the
generated Fabric metadata under ``.generated/tokenomics/fabric.json``. Nothing in
this module is hard-coded: paths may be overridden with environment variables so
the same code runs locally, in CI, and in Azure App Service.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional


def _repo_root() -> Path:
    # api/app/config.py -> repo root is three levels up.
    return Path(__file__).resolve().parents[2]


def _find_file(rel: str, env_var: str = "") -> Path:
    """Robustly locate a bundled file (e.g. ``config/deployment.json``).

    Resolution order, tolerant of both the container layout (``/srv/api/app`` +
    ``/srv/config``) and the App Service code layout (``<extract>/app`` +
    ``<extract>/config``):
      1. An explicit environment override, but only if it actually exists.
      2. Walk up from this module looking for ``<parent>/<rel>``.
      3. Fall back to the current working directory.
    """
    if env_var:
        override = os.environ.get(env_var, "")
        if override and Path(override).exists():
            return Path(override)
    here = Path(__file__).resolve()
    for parent in [here.parent, *here.parents]:
        candidate = parent / rel
        if candidate.exists():
            return candidate
    return Path.cwd() / rel


def _load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


# Microsoft (source_code ``msft``) rows are split into products by service_code:
# Azure AI Foundry is token-billed, Microsoft Copilot Studio is AI-credit-billed.
SERVICE_AZURE_AI_FOUNDRY = "azure-ai-foundry"
SERVICE_COPILOT_STUDIO = "copilot-studio"


@dataclass(frozen=True)
class ProviderInfo:
    code: str
    name: str


@dataclass(frozen=True)
class ServiceProviderInfo:
    """A billable product under a provider, such as Copilot Studio under ``msft``."""

    service_code: str
    provider_code: str
    name: str
    consumption_unit: str = "tokens"


# Labels used when dashboardApi.serviceProviders is absent from the config.
_FALLBACK_SERVICE_PROVIDERS: list[ServiceProviderInfo] = [
    ServiceProviderInfo(SERVICE_AZURE_AI_FOUNDRY, "msft", "Azure AI Foundry", "tokens"),
    ServiceProviderInfo(SERVICE_COPILOT_STUDIO, "msft", "Microsoft Copilot Studio", "ai_credits"),
]


@dataclass(frozen=True)
class PowerBiArtifact:
    id: str
    name: str
    embed_url: str


@dataclass(frozen=True)
class FoundrySettings:
    account_name: str
    project_name: str
    project_endpoint: str
    model_deployment: str
    api_version: str
    agent_name: str
    agent_display_name: str
    instructions: str
    tracing_enabled: bool = False
    tracing_conn_env: str = "APPLICATIONINSIGHTS_CONNECTION_STRING"
    tracing_content_recording: bool = False

    @property
    def configured(self) -> bool:
        return bool(self.project_endpoint and self.agent_name and self.model_deployment)


@dataclass(frozen=True)
class Settings:
    """Immutable, fully config-driven settings for the API."""

    # Fabric SQL analytics endpoint
    sql_endpoint_host: str
    lakehouse_name: str
    workspace_id: str
    schema: str
    usage_fact_table: str
    price_history_table: str
    odbc_driver: str
    sql_connect_timeout: int
    sql_query_timeout: int

    # Presentation / behavior
    currency: str
    default_window_days: int
    allowed_window_days: list[int]
    providers: list[ProviderInfo]
    cors_allowed_origins: list[str]

    # Hosting
    host: str
    port: int

    # Azure Cost Management scope (for the actualCost snapshot)
    actual_cost_scope: str
    actual_cost_billing_lag_hours: int
    actual_cost_enabled: bool

    # Power BI embedding
    powerbi_workspace_id: str
    powerbi_reports: dict[str, PowerBiArtifact] = field(default_factory=dict)
    powerbi_dashboards: dict[str, PowerBiArtifact] = field(default_factory=dict)

    # Foundry agent chat (optional)
    foundry: Optional["FoundrySettings"] = None

    # ML action engine (recommendations) inputs
    insight_fact_table: str = "ml_insight_fact"
    ml_use_cases: list = field(default_factory=list)
    apim_rate_limit_calls: int = 60
    apim_rate_limit_renewal_seconds: int = 60
    apim_model_token_limit_per_minute: int = 50000

    # Pricing source of truth (Fabric ``prices`` schema)
    prices_schema: str = "prices"
    prices_table: str = "token_price_history"
    ai_credit_price_table: str = "ai_credit_price_history"

    # Products under a provider (Azure AI Foundry vs Copilot Studio under msft)
    service_providers: list[ServiceProviderInfo] = field(default_factory=list)

    # Public showcase visit analytics
    showcase_cosmos_endpoint: str = ""
    showcase_cosmos_database: str = ""
    showcase_cosmos_container: str = ""
    showcase_visit_retention_days: int = 90
    azure_maps_client_id: str = ""
    resource_tenant_id: str = ""
    resource_api_client_id: str = ""
    delegated_scope: str = ""
    allowed_user_object_ids: list[str] = field(default_factory=list)

    def provider_name(self, code: str) -> str:
        for provider in self.providers:
            if provider.code == code:
                return provider.name
        return code

    def provider_label(self, source_code: str | None, service_code: str | None = None) -> str | None:
        """Provider label for a usage or price row.

        Azure AI Foundry (token-billed) and Microsoft Copilot Studio (credit-billed)
        both use source_code ``msft``, so the service decides the label for Microsoft
        rows. Every other source is labelled by ``provider_name``.
        """
        if source_code is None:
            return None
        code = str(source_code)
        if code == "msft":
            service = str(service_code or SERVICE_AZURE_AI_FOUNDRY)
            for entry in self.service_providers or _FALLBACK_SERVICE_PROVIDERS:
                if entry.provider_code == code and entry.service_code == service:
                    return entry.name
        return self.provider_name(code)

    def resolve_window(self, days: int | None) -> int:
        if days is None:
            return self.default_window_days
        return days if days in self.allowed_window_days else self.default_window_days


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    config_path = _find_file("config/deployment.json", "TOKENOMICS_CONFIG_PATH")
    fabric_meta_path = _find_file(".generated/tokenomics/fabric.json", "TOKENOMICS_FABRIC_METADATA_PATH")

    config = _load_json(config_path)
    api_cfg = config.get("dashboardApi", {})
    fabric_cfg = config.get("fabric", {})
    platform_fabric = config.get("tokenomicsPlatform", {}).get("fabric", {})
    platform_cosmos = config.get("tokenomicsPlatform", {}).get("cosmos", {})
    showcase_visits = platform_cosmos.get("showcaseVisits", {})
    reporting_tables = platform_fabric.get("reportingTables", {})
    power_bi = config.get("powerBi", {})
    actual_cost = config.get("tokenomics", {}).get("actualCost", {})
    apim_cfg = config.get("apim", {})
    foundry_cfg = config.get("foundry", {})

    # SQL endpoint host: prefer the generated Fabric metadata (source of truth for
    # the live workspace), fall back to the static deployment config.
    sql_host = ""
    workspace_id = fabric_cfg.get("workspaceId", "")
    if fabric_meta_path.exists():
        meta = _load_json(fabric_meta_path)
        sql_host = str(meta.get("sqlEndpointConnectionString", "")).strip()
        workspace_id = str(meta.get("workspaceId", workspace_id)).strip()
    if not sql_host:
        sql_host = str(fabric_cfg.get("sqlEndpointHost", "")).strip()

    # Allow explicit override (e.g. App Service app setting).
    sql_host = os.environ.get("TOKENOMICS_SQL_ENDPOINT_HOST", sql_host)

    providers = [
        ProviderInfo(code=p["code"], name=p["name"]) for p in api_cfg.get("providers", [])
    ]

    service_providers = [
        ServiceProviderInfo(
            service_code=str(s["serviceCode"]),
            provider_code=str(s["providerCode"]),
            name=str(s["name"]),
            consumption_unit=str(s.get("consumptionUnit", "tokens")),
        )
        for s in api_cfg.get("serviceProviders", [])
    ]

    def _artifact(id_key: str, name_key: str, url_key: str) -> PowerBiArtifact | None:
        artifact_id = power_bi.get(id_key)
        if not artifact_id:
            return None
        return PowerBiArtifact(
            id=str(artifact_id),
            name=str(power_bi.get(name_key, "")),
            embed_url=str(power_bi.get(url_key, "")),
        )

    reports: dict[str, PowerBiArtifact] = {}
    for key, keys in {
        "consumption": ("consumptionReportId", "consumptionReportName", "consumptionReportEmbedUrl"),
        "ml-insights": ("mlReportId", "mlReportName", "mlReportEmbedUrl"),
    }.items():
        artifact = _artifact(*keys)
        if artifact:
            reports[key] = artifact

    dashboards: dict[str, PowerBiArtifact] = {}
    for key, keys in {
        "executive": ("executiveDashboardId", "executiveDashboardName", "executiveDashboardEmbedUrl"),
        "ml-operations": ("mlDashboardId", "mlDashboardName", "mlDashboardEmbedUrl"),
    }.items():
        artifact = _artifact(*keys)
        if artifact:
            dashboards[key] = artifact

    foundry: Optional[FoundrySettings] = None
    if foundry_cfg:
        account = str(foundry_cfg.get("accountName", "")).strip()
        project = str(foundry_cfg.get("projectName", foundry_cfg.get("tokenomicsProjectName", ""))).strip()
        default_endpoint = (
            f"https://{account}.services.ai.azure.com/api/projects/{project}"
            if account and project
            else ""
        )
        project_endpoint = os.environ.get(
            "TOKENOMICS_FOUNDRY_PROJECT_ENDPOINT",
            str(foundry_cfg.get("projectEndpoint", foundry_cfg.get("tokenomicsProjectEndpoint", default_endpoint))),
        )
        tracing_cfg = foundry_cfg.get("tracing", {})
        foundry = FoundrySettings(
            account_name=account,
            project_name=project,
            project_endpoint=project_endpoint,
            model_deployment=str(foundry_cfg.get("modelDeployment", "")),
            api_version=str(foundry_cfg.get("apiVersion", "2025-05-15-preview")),
            agent_name=str(foundry_cfg.get("agentName", "")),
            agent_display_name=str(foundry_cfg.get("agentDisplayName", foundry_cfg.get("agentName", ""))),
            instructions=str(foundry_cfg.get("instructions", "")),
            tracing_enabled=bool(tracing_cfg.get("enabled", False)),
            tracing_conn_env=str(tracing_cfg.get("applicationInsightsConnectionStringEnv", "APPLICATIONINSIGHTS_CONNECTION_STRING")),
            tracing_content_recording=bool(tracing_cfg.get("contentRecordingEnabled", False)),
        )

    return Settings(
        sql_endpoint_host=sql_host,
        lakehouse_name=str(fabric_cfg.get("lakehouseName", platform_fabric.get("lakehouseName", "lh_tokenomics"))),
        workspace_id=str(power_bi.get("workspaceId", workspace_id)),
        schema=str(api_cfg.get("schema", platform_fabric.get("outputSchema", "ml"))),
        usage_fact_table=str(api_cfg.get("usageFactTable", reporting_tables.get("usageFact", "tokenomics_usage_fact"))),
        price_history_table=str(api_cfg.get("priceHistoryTable", reporting_tables.get("priceHistory", "model_price_history"))),
        odbc_driver=str(api_cfg.get("odbcDriver", "ODBC Driver 18 for SQL Server")),
        sql_connect_timeout=int(api_cfg.get("sqlConnectTimeoutSeconds", 30)),
        sql_query_timeout=int(api_cfg.get("sqlQueryTimeoutSeconds", 120)),
        currency=str(api_cfg.get("currency", config.get("tokenomics", {}).get("currency", "USD"))),
        default_window_days=int(api_cfg.get("defaultWindowDays", 30)),
        allowed_window_days=list(api_cfg.get("allowedWindowDays", [1, 7, 30, 90])),
        providers=providers,
        cors_allowed_origins=list(api_cfg.get("cors", {}).get("allowedOrigins", [])),
        host=os.environ.get("TOKENOMICS_API_HOST", str(api_cfg.get("host", "0.0.0.0"))),
        port=int(os.environ.get("PORT", api_cfg.get("port", 8080))),
        actual_cost_scope=str(actual_cost.get("scope", "")),
        actual_cost_billing_lag_hours=int(actual_cost.get("billingLagHours", 24)),
        actual_cost_enabled=bool(actual_cost.get("enabled", False)),
        powerbi_workspace_id=str(power_bi.get("workspaceId", workspace_id)),
        powerbi_reports=reports,
        powerbi_dashboards=dashboards,
        foundry=foundry,
        insight_fact_table=str(reporting_tables.get("insightFact", "ml_insight_fact")),
        ml_use_cases=list(platform_fabric.get("mlUseCases", [])),
        apim_rate_limit_calls=int(apim_cfg.get("rateLimitCalls", 60)),
        apim_rate_limit_renewal_seconds=int(apim_cfg.get("rateLimitRenewalSeconds", 60)),
        apim_model_token_limit_per_minute=int(apim_cfg.get("modelTokenLimitPerMinute", 50000)),
        prices_schema=str(api_cfg.get("pricesSchema", "prices")),
        prices_table=str(api_cfg.get("pricesTable", "token_price_history")),
        ai_credit_price_table=str(api_cfg.get("aiCreditPriceTable", "ai_credit_price_history")),
        service_providers=service_providers,
        showcase_cosmos_endpoint=os.environ.get(
            "SHOWCASE_COSMOS_ENDPOINT",
            f"https://{platform_cosmos.get('accountName', '')}.documents.azure.com:443/"
            if platform_cosmos.get("accountName")
            else "",
        ),
        showcase_cosmos_database=os.environ.get(
            "SHOWCASE_COSMOS_DATABASE",
            str(platform_cosmos.get("databaseName", "")),
        ),
        showcase_cosmos_container=os.environ.get(
            "SHOWCASE_COSMOS_CONTAINER",
            str(showcase_visits.get("containerName", "")),
        ),
        showcase_visit_retention_days=int(
            os.environ.get(
                "SHOWCASE_VISIT_RETENTION_DAYS",
                showcase_visits.get("retentionDays", 90),
            )
        ),
        azure_maps_client_id=os.environ.get("AZURE_MAPS_CLIENT_ID", ""),
        resource_tenant_id=str(config.get("identity", {}).get("resourceTenantId", "")),
        resource_api_client_id=os.environ.get(
            "TOKENOMICS_RESOURCE_API_CLIENT_ID",
            str(api_cfg.get("resourceApiClientId", "")),
        ),
        delegated_scope=str(config.get("identity", {}).get("delegatedScope", "")),
        allowed_user_object_ids=list(config.get("identity", {}).get("allowedUserObjectIds", [])),
    )
