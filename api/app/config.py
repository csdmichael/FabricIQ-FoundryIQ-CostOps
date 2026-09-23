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


def _load_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


@dataclass(frozen=True)
class ProviderInfo:
    code: str
    name: str


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
    data_agent_mcp_target: str
    data_agent_connection_name: str
    data_agent_tool_label: str

    @property
    def configured(self) -> bool:
        return bool(self.project_endpoint and self.agent_name)


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

    def provider_name(self, code: str) -> str:
        for provider in self.providers:
            if provider.code == code:
                return provider.name
        return code

    def resolve_window(self, days: int | None) -> int:
        if days is None:
            return self.default_window_days
        return days if days in self.allowed_window_days else self.default_window_days


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    root = _repo_root()
    config_path = Path(os.environ.get("TOKENOMICS_CONFIG_PATH", root / "config" / "deployment.json"))
    fabric_meta_path = Path(
        os.environ.get(
            "TOKENOMICS_FABRIC_METADATA_PATH",
            root / ".generated" / "tokenomics" / "fabric.json",
        )
    )

    config = _load_json(config_path)
    api_cfg = config.get("dashboardApi", {})
    fabric_cfg = config.get("fabric", {})
    platform_fabric = config.get("tokenomicsPlatform", {}).get("fabric", {})
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
        project = str(foundry_cfg.get("tokenomicsProjectName", "")).strip()
        default_endpoint = (
            f"https://{account}.services.ai.azure.com/api/projects/{project}"
            if account and project
            else ""
        )
        project_endpoint = os.environ.get(
            "TOKENOMICS_FOUNDRY_PROJECT_ENDPOINT",
            str(foundry_cfg.get("tokenomicsProjectEndpoint", default_endpoint)),
        )
        gateway = str(apim_cfg.get("gatewayUrl", "")).rstrip("/")
        mcp_path = str(apim_cfg.get("dataAgentMcpPath", "")).strip("/")
        mcp_target = f"{gateway}/{mcp_path}/mcp" if gateway and mcp_path else ""
        mcp_cfg = foundry_cfg.get("dataAgentMcp", {})
        foundry = FoundrySettings(
            account_name=account,
            project_name=project,
            project_endpoint=project_endpoint,
            model_deployment=str(foundry_cfg.get("modelDeployment", "")),
            api_version=str(foundry_cfg.get("apiVersion", "2025-05-15-preview")),
            agent_name=str(foundry_cfg.get("agentName", "")),
            agent_display_name=str(foundry_cfg.get("agentDisplayName", foundry_cfg.get("agentName", ""))),
            instructions=str(foundry_cfg.get("instructions", "")),
            data_agent_mcp_target=str(mcp_cfg.get("target", mcp_target)),
            data_agent_connection_name=str(mcp_cfg.get("connectionName", "")),
            data_agent_tool_label=str(mcp_cfg.get("toolLabel", "fabric_tokenomics_data_agent")),
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
    )
