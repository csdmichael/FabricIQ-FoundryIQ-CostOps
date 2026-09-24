"""FastAPI application exposing live Microsoft Fabric tokenomics data.

Endpoints:
    GET /health          - liveness + Fabric connectivity probe
    GET /summary         - TokenomicsDashboard for a window (?days=1|7|30|90)
    GET /powerbi/embed   - Power BI report/dashboard embed configuration

Configuration is fully file-driven (see ``config/deployment.json`` ->
``dashboardApi`` and ``powerBi``). No values are hard-coded in this module.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .agent_service import AgentChatService, AgentUnavailableError
from .config import get_settings
from .dashboard_service import DashboardService
from .fabric_client import FabricSqlClient
from .models import (
    ChatRequest,
    ChatResponse,
    PowerBiEmbedArtifact,
    PowerBiEmbedConfig,
    SamplePrompt,
    TokenomicsDashboard,
)

logger = logging.getLogger("tokenomics.api")

settings = get_settings()
app = FastAPI(
    title="Fabric Tokenomics API",
    version="2.0.0",
    description="Live multi-cloud AI tokenomics served from the Microsoft Fabric Lakehouse.",
)

if settings.cors_allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allowed_origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=True,
    )

_client = FabricSqlClient(settings)
_service = DashboardService(settings, _client)
_agent = AgentChatService(settings, _client)


def _load_prompts() -> dict:
    root = Path(__file__).resolve().parents[2]
    path = Path(
        os.environ.get("TOKENOMICS_PROMPTS_PATH", root / "config" / "tokenomics-prompts.json")
    )
    if not path.exists():
        return {"welcomeMessage": "", "prompts": []}
    with open(path, "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


@app.get("/health")
def health() -> dict:
    fabric_ok = False
    detail = "ok"
    try:
        fabric_ok = _client.ping()
    except Exception as exc:  # pragma: no cover - connectivity dependent
        detail = f"fabric_unavailable: {exc}"
        logger.warning("Health probe failed: %s", exc)
    return {
        "status": "ok" if fabric_ok else "degraded",
        "fabric": fabric_ok,
        "sqlEndpoint": settings.sql_endpoint_host,
        "lakehouse": settings.lakehouse_name,
        "detail": detail,
    }


@app.get("/summary", response_model=TokenomicsDashboard)
def summary(days: int = Query(default=None, description="Observation window in days")) -> TokenomicsDashboard:
    window = settings.resolve_window(days)
    try:
        return _service.build(window)
    except Exception as exc:  # pragma: no cover - connectivity dependent
        logger.exception("Failed to build tokenomics summary")
        raise HTTPException(status_code=502, detail=f"fabric_query_failed: {exc}") from exc


@app.get("/pricing")
def pricing() -> list[dict]:
    """Current multi-cloud model rate cards from the Fabric price-history table."""
    try:
        return _service.pricing()
    except Exception as exc:  # pragma: no cover - connectivity dependent
        logger.exception("Failed to load pricing")
        raise HTTPException(status_code=502, detail=f"fabric_query_failed: {exc}") from exc


@app.get("/powerbi/embed", response_model=PowerBiEmbedConfig)
def powerbi_embed() -> PowerBiEmbedConfig:
    if not settings.powerbi_workspace_id:
        raise HTTPException(status_code=404, detail="powerbi_not_configured")
    reports = [
        PowerBiEmbedArtifact(key=key, kind="report", id=a.id, name=a.name, embedUrl=a.embed_url)
        for key, a in settings.powerbi_reports.items()
    ]
    dashboards = [
        PowerBiEmbedArtifact(key=key, kind="dashboard", id=a.id, name=a.name, embedUrl=a.embed_url)
        for key, a in settings.powerbi_dashboards.items()
    ]
    return PowerBiEmbedConfig(
        workspaceId=settings.powerbi_workspace_id,
        reports=reports,
        dashboards=dashboards,
    )


@app.get("/prompts")
def prompts() -> dict:
    """Config-driven sample prompts + welcome message for the chat UI."""
    data = _load_prompts()
    return {
        "welcomeMessage": data.get("welcomeMessage", ""),
        "agent": settings.foundry.agent_display_name if settings.foundry else "",
        "prompts": [SamplePrompt(**p).model_dump() for p in data.get("prompts", [])],
    }


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Ask the Foundry Tokenomics agent (which calls the Fabric Data Agent via APIM)."""
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="message_required")
    if not _agent.configured:
        raise HTTPException(status_code=503, detail="foundry_agent_not_configured")
    try:
        result = _agent.chat(request.message.strip(), request.threadId)
    except AgentUnavailableError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ChatResponse(
        reply=result["reply"],
        threadId=result.get("threadId"),
        citations=result.get("citations", []),
        agent=settings.foundry.agent_display_name if settings.foundry else "",
    )
