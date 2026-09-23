"""Offline tests for the Tokenomics FastAPI service.

These tests exercise config loading, response-model shaping, and endpoint wiring
without requiring Fabric connectivity (the Fabric client is stubbed).
"""
from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from app.config import get_settings  # noqa: E402
from app.models import (  # noqa: E402
    ActualCostSnapshot,
    DashboardSummary,
    DataQuality,
    TokenomicsDashboard,
    TokenomicsRow,
)


def test_settings_are_config_driven():
    settings = get_settings()
    assert settings.provider_name("aws") == "AWS Bedrock"
    assert settings.provider_name("cld") == "Anthropic Claude"
    assert settings.provider_name("zzz") == "zzz"
    assert settings.resolve_window(7) == 7
    assert settings.resolve_window(999) == settings.default_window_days
    assert settings.resolve_window(None) == settings.default_window_days
    assert "consumption" in settings.powerbi_reports
    assert settings.powerbi_reports["consumption"].id


def _sample_dashboard() -> TokenomicsDashboard:
    return TokenomicsDashboard(
        generatedAt="2026-09-22T00:00:00Z",
        windowDays=30,
        currency="USD",
        queryStatus="complete",
        actualCost=ActualCostSnapshot(
            status="available",
            scope="/subscriptions/x",
            currency="USD",
            generatedAt="2026-09-22T00:00:00Z",
            billedThrough="2026-09-21",
            expectedBillingLagHours=24,
            dedicatedModelCost=100.0,
            allocatedModelCost=100.0,
            allocationMethod="observed-token-share",
        ),
        summary=DashboardSummary(
            requests=10,
            successfulRequests=10,
            failedRequests=0,
            tokenizedRequests=10,
            tokenCoveragePct=100.0,
            inputTokens=7,
            outputTokens=3,
            totalTokens=10,
            p95LatencyMs=300,
            marketCost=12.0,
            negotiatedCost=10.0,
            savings=2.0,
            pricingCoveragePct=100.0,
        ),
        trend=[TokenomicsRow(TimeBucket="2026-09-22", TotalTokens=10)],
        allocations=[TokenomicsRow(ApplicationId="app-1", TotalTokens=10)],
        models=[TokenomicsRow(Model="claude-sonnet-4", ModelFamily="Claude Sonnet", TotalTokens=10)],
        operations=[TokenomicsRow(OperationId="summarization", Requests=10, Successes=10, Errors=0)],
        recentRequests=[TokenomicsRow(TimeBucket="2026-09-22 00:00:00", Model="claude-sonnet-4")],
        dataQuality=DataQuality(
            requestTelemetry="available",
            tokenTelemetry="available",
            pricing="negotiated",
            allocation="attributed",
            billing="actual",
        ),
    )


def test_dashboard_contract_serializes():
    dash = _sample_dashboard()
    payload = dash.model_dump()
    assert payload["currency"] == "USD"
    assert payload["summary"]["savings"] == 2.0
    assert payload["models"][0]["ModelFamily"] == "Claude Sonnet"


def test_powerbi_embed_endpoint():
    import app.main as main

    client = TestClient(main.app)
    response = client.get("/powerbi/embed")
    assert response.status_code == 200
    body = response.json()
    assert body["workspaceId"]
    assert body["tokenType"] == "Aad"
    keys = {r["key"] for r in body["reports"]}
    assert "consumption" in keys


def test_summary_endpoint_uses_service(monkeypatch):
    import app.main as main

    monkeypatch.setattr(main._service, "build", lambda days: _sample_dashboard())
    client = TestClient(main.app)
    response = client.get("/summary?days=30")
    assert response.status_code == 200
    assert response.json()["summary"]["requests"] == 10
