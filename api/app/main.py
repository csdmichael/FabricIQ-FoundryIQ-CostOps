"""FastAPI application exposing live Microsoft Fabric tokenomics data.

Endpoints:
    GET /health          - liveness + Fabric connectivity probe
    GET /summary         - TokenomicsDashboard for a window (?days=1|7|30|90)
    GET /pricing         - current multi-cloud model rate cards
    GET /actions         - data-driven FinOps action plans (closed feedback loop)
    GET /powerbi/embed   - Power BI report/dashboard embed configuration

Configuration is fully file-driven (see ``config/deployment.json`` ->
``dashboardApi`` and ``powerBi``). No values are hard-coded in this module.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import ipaddress

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .agent_service import AgentChatService, AgentUnavailableError
from .auth_validation import EntraTokenValidator
from .config import get_settings
from .dashboard_service import DashboardService
from .fabric_client import FabricError, FabricSqlClient
from .models import (
    ActionRecommendationsResponse,
    ChatRequest,
    ChatResponse,
    ConsumptionCost,
    PowerBiEmbedArtifact,
    PowerBiEmbedConfig,
    SamplePrompt,
    ShowcaseVisitRequest,
    ShowcaseVisitsReport,
    TokenomicsDashboard,
)
from .recommendations_service import RecommendationsService
from .showcase_visits_service import ShowcaseVisitService, ShowcaseVisitsUnavailableError

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
_recommendations = RecommendationsService(settings, _client)
_showcase_visits = ShowcaseVisitService(settings)
_token_validator = EntraTokenValidator(settings)


@app.exception_handler(FabricError)
async def _fabric_error_handler(_request, exc: FabricError) -> JSONResponse:
    """Return the *real* classified reason + remediation (not a raw stack trace)."""
    return JSONResponse(status_code=exc.http_status, content={"detail": exc.to_dict()})


def _load_prompts() -> dict:
    from .config import _find_file

    path = _find_file("config/tokenomics-prompts.json", "TOKENOMICS_PROMPTS_PATH")
    if not path.exists():
        return {"welcomeMessage": "", "prompts": []}
    with open(path, "r", encoding="utf-8-sig") as handle:
        return json.load(handle)


@app.get("/health")
def health() -> dict:
    """Liveness + classified Fabric connectivity (surfaces capacity-paused, auth, etc.)."""
    probe = _client.diagnose()
    return {
        "status": "ok" if probe.get("ok") else "degraded",
        "fabric": bool(probe.get("ok")),
        "sqlEndpoint": settings.sql_endpoint_host,
        "lakehouse": settings.lakehouse_name,
        "reason": probe.get("reason", ""),
        "remediation": probe.get("remediation", ""),
        "category": probe.get("category", "unknown"),
    }


@app.get("/summary", response_model=TokenomicsDashboard)
def summary(days: int = Query(default=None, description="Observation window in days")) -> TokenomicsDashboard:
    window = settings.resolve_window(days)
    try:
        return _service.build(window)
    except FabricError:
        raise  # classified reason + remediation handled centrally
    except Exception as exc:  # pragma: no cover - connectivity dependent
        logger.exception("Failed to build tokenomics summary")
        raise HTTPException(status_code=502, detail=f"fabric_query_failed: {exc}") from exc


@app.get("/pricing")
def pricing() -> list[dict]:
    """Current multi-cloud model rate cards from the governed prices schema."""
    try:
        return _service.pricing()
    except FabricError:
        raise
    except Exception as exc:  # pragma: no cover - connectivity dependent
        logger.exception("Failed to load pricing")
        raise HTTPException(status_code=502, detail=f"fabric_query_failed: {exc}") from exc


@app.get("/pricing/consumption", response_model=ConsumptionCost)
def pricing_consumption(days: int = Query(default=None, description="Observation window in days")) -> ConsumptionCost:
    """Total token consumption cost computed live by joining usage to the
    governed ``prices`` price history effective at each usage date."""
    window = settings.resolve_window(days)
    try:
        return ConsumptionCost(**_service.consumption_cost(window))
    except FabricError:
        raise
    except Exception as exc:  # pragma: no cover - connectivity dependent
        logger.exception("Failed to compute consumption cost")
        raise HTTPException(status_code=502, detail=f"fabric_query_failed: {exc}") from exc


@app.get("/actions", response_model=ActionRecommendationsResponse)
def actions(days: int = Query(default=None, description="Observation window in days")) -> ActionRecommendationsResponse:
    """Data-driven FinOps action plans derived from the ml.*_output tables.

    Closes the analytics feedback loop: each ML signal becomes a concrete,
    reviewable action (model switch, APIM rate/token-limit change, quota
    reallocation, throttle guardrail, prompt trimming, chargeback). Returns an
    explicit empty/unavailable status when the ML tables are not yet populated
    rather than fabricating recommendations.
    """
    window = settings.resolve_window(days)
    try:
        return _recommendations.build(window)
    except Exception as exc:  # pragma: no cover - connectivity dependent
        logger.exception("Failed to build action recommendations")
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


def _showcase_client_ip(request: Request) -> str:
    candidates = [
        request.headers.get("x-showcase-client-ip", ""),
        request.headers.get("x-forwarded-for", "").split(",")[0].strip(),
        request.headers.get("x-azure-clientip", ""),
        request.client.host if request.client else "",
    ]
    for candidate in candidates:
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            continue
    raise HTTPException(status_code=400, detail="client_ip_unavailable")


@app.post("/showcase/visits", status_code=status.HTTP_201_CREATED)
def record_showcase_visit(payload: ShowcaseVisitRequest, request: Request) -> dict:
    """Record one public showcase page load in Cosmos DB."""
    try:
        _showcase_visits.record(
            ip_address=_showcase_client_ip(request),
            timezone_name=payload.timezone,
            user_agent=request.headers.get("user-agent"),
        )
    except ShowcaseVisitsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to record showcase visit")
        raise HTTPException(status_code=502, detail="showcase_visit_write_failed") from exc
    return {"recorded": True}


@app.get("/showcase/visits", response_model=ShowcaseVisitsReport)
def showcase_visits(
    request: Request,
    days: int = Query(default=30, ge=1, le=90),
) -> ShowcaseVisitsReport:
    """Return visit count, unique-IP estimate, location, and visit timestamps."""
    _token_validator.validate(request.headers.get("authorization"))
    try:
        return _showcase_visits.report(days)
    except ShowcaseVisitsUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to load showcase visits")
        raise HTTPException(status_code=502, detail="showcase_visit_query_failed") from exc


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
