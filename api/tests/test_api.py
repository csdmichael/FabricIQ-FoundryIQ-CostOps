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


def test_actions_endpoint_uses_service(monkeypatch):
    import app.main as main
    from app.models import ActionRecommendationsResponse

    sample = ActionRecommendationsResponse(
        generatedAt="2026-09-22T00:00:00Z",
        windowDays=30,
        currency="USD",
        status="empty",
        detail="no signals",
    )
    monkeypatch.setattr(main._recommendations, "build", lambda days: sample)
    client = TestClient(main.app)
    response = client.get("/actions?days=30")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "empty"
    assert body["plans"] == []


def test_record_showcase_visit_uses_forwarded_ip(monkeypatch):
    import app.main as main

    recorded = {}

    def record(**kwargs):
        recorded.update(kwargs)

    monkeypatch.setattr(main._showcase_visits, "record", record)
    client = TestClient(main.app)
    response = client.post(
        "/showcase/visits",
        json={"timezone": "America/Los_Angeles"},
        headers={"x-showcase-client-ip": "203.0.113.10", "user-agent": "test-agent"},
    )

    assert response.status_code == 201
    assert response.json() == {"recorded": True}
    assert recorded == {
        "ip_address": "203.0.113.10",
        "timezone_name": "America/Los_Angeles",
        "user_agent": "test-agent",
    }


def test_showcase_visits_report_endpoint(monkeypatch):
    import app.main as main
    from app.models import ShowcaseVisit, ShowcaseVisitsReport

    report = ShowcaseVisitsReport(
        generatedAt="2026-09-27T20:00:00Z",
        days=30,
        totalVisits=2,
        uniqueVisitors=1,
        visits=[
            ShowcaseVisit(
                id="visit-1",
                visitDate="2026-09-27",
                visitedAt="2026-09-27T20:00:00Z",
                ipAddress="203.0.113.10",
                location="US",
                countryCode="US",
                timezone="America/Los_Angeles",
            )
        ],
    )
    monkeypatch.setattr(main._showcase_visits, "report", lambda days: report)
    monkeypatch.setattr(main._token_validator, "validate", lambda authorization: {"oid": "test"})
    client = TestClient(main.app)
    response = client.get(
        "/showcase/visits?days=30",
        headers={"authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    assert response.json()["uniqueVisitors"] == 1
    assert response.json()["visits"][0]["location"] == "US"


def test_showcase_visits_report_requires_authorization():
    import app.main as main

    client = TestClient(main.app)
    response = client.get("/showcase/visits?days=30")

    assert response.status_code == 401
    assert response.json()["detail"] == "authorization_required"


def test_recommendations_service_builds_model_switch_plan():
    """The action engine turns an ml.*_output row into a concrete plan."""
    from app.recommendations_service import RecommendationsService

    settings = get_settings()

    class FakeClient:
        def query(self, sql, params=()):
            if "INFORMATION_SCHEMA" in sql:
                return [{"TABLE_NAME": "model_optimization_output"}]
            return [{
                "entity_type": "team", "entity_id": "research",
                "team_id": "research", "project_id": "falcon",
                "department_id": None, "cost_center_id": None,
                "model_family": "GPT-5", "model_name": "gpt-5",
                "source_code": "oai", "probability": 0.9, "risk_score": 12.0,
                "estimated_savings_usd": 300.0, "predicted_cost_usd": 100.0,
                "recommendation": "Switch summarization to a mini tier.",
            }]

    service = RecommendationsService(settings, FakeClient())
    result = service.build(30)
    assert result.status == "available"
    assert result.plans, "expected at least one action plan"
    plan = result.plans[0]
    assert plan.category == "model-switch"
    assert plan.sourceTable.endswith("model_optimization_output")
    assert plan.changes and plan.changes[0].kind == "model-map"
    assert plan.estimatedAnnualImpactUsd and plan.estimatedAnnualImpactUsd > 0
    assert result.totalEstimatedAnnualSavingsUsd > 0


def test_recommendations_service_reports_unavailable_on_error():
    from app.recommendations_service import RecommendationsService

    settings = get_settings()

    class BrokenClient:
        def query(self, sql, params=()):
            raise RuntimeError("no connection")

    service = RecommendationsService(settings, BrokenClient())
    result = service.build(30)
    assert result.status == "unavailable"
    assert result.plans == []


def test_fabric_client_classifies_capacity_paused_and_opens_breaker(monkeypatch):
    """The real reason (capacity paused) is surfaced, and after repeated failures
    the breaker fails fast without hitting the database again."""
    import pytest
    from app.fabric_client import FabricError, FabricSqlClient

    client = FabricSqlClient(get_settings())
    calls = {"n": 0}

    def boom(sql, params):
        calls["n"] += 1
        raise Exception("Database 'lh_tokenomics' on server is not currently available; resume the capacity")

    monkeypatch.setattr(client, "_run", boom)

    with pytest.raises(FabricError) as first:
        client.query("SELECT 1")
    assert first.value.category == "capacity_paused"
    assert first.value.http_status == 503
    assert "Resume the Fabric capacity" in first.value.remediation

    with pytest.raises(FabricError):
        client.query("SELECT 1")  # second failure opens the breaker

    calls_before = calls["n"]
    with pytest.raises(FabricError) as third:
        client.query("SELECT 1")
    assert third.value.category == "circuit_open"
    assert calls["n"] == calls_before  # fast-fail: _run not invoked while open


def test_fabric_client_retries_transient_then_succeeds(monkeypatch):
    from app.fabric_client import FabricSqlClient

    client = FabricSqlClient(get_settings())
    attempts = {"n": 0}

    def flaky(sql, params):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise Exception("TCP Provider: connection timeout expired")
        return [{"ok": 1}]

    monkeypatch.setattr(client, "_run", flaky)
    rows = client.query("SELECT 1")
    assert rows == [{"ok": 1}]
    assert attempts["n"] == 2  # one quick retry recovered


def test_user_consumption_and_segmentation_endpoints(monkeypatch):
    import app.main as main
    from app.models import (
        UserClusterSummary,
        UserConsumptionItem,
        UserConsumptionResponse,
        UserSegmentationResponse,
    )

    fake_item = UserConsumptionItem(
        userIdHash="hash12345678",
        userName="Dr. Sanjay Mehrotra",
        userEmail="sanjay.mehrotra@micron-corp.com",
        jobTitle="President & Chief Executive Officer",
        department="Executive Leadership",
        businessUnit="Corporate & Shared Services",
        teamId="exec-ops",
        projectId="yield-copilot",
        costCenter="CC-AIP-742",
        totalTokens=12500000,
        inputTokens=9000000,
        outputTokens=3500000,
        marketCost=145.50,
        negotiatedCost=128.00,
        requestCount=420,
        clusterId=3,
        clusterName="Executive & Strategic Decision Makers",
        primaryModel="gpt-astra",
        primaryProvider="Azure OpenAI",
    )

    fake_consumption = UserConsumptionResponse(
        totalUsers=1,
        totalTokens=12500000,
        totalMarketCost=145.50,
        totalNegotiatedCost=128.00,
        page=1,
        pageSize=20,
        totalPages=1,
        users=[fake_item],
    )

    fake_cluster = UserClusterSummary(
        clusterId=3,
        clusterName="Executive & Strategic Decision Makers",
        clusterDescription="Executive briefings and strategic synthesis",
        userCount=1,
        totalTokens=12500000,
        totalMarketCost=145.50,
        avgTokensPerUser=12500000,
        avgCostPerUser=145.50,
        color="#f59e0b",
        persona="Executive",
        topTraits=["High synthesis ratio"],
        recommendation="Deploy GPT Astra with pre-computed executive caching",
        topUsers=[fake_item],
    )

    fake_segmentation = UserSegmentationResponse(
        totalUsers=1,
        totalClusters=1,
        clusters=[fake_cluster],
    )

    monkeypatch.setattr(main._service, "user_consumption", lambda **kwargs: fake_consumption)
    monkeypatch.setattr(main._service, "user_segmentation", lambda **kwargs: fake_segmentation)

    client = TestClient(main.app)
    resp1 = client.get("/users/consumption?days=30")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["totalUsers"] == 1
    assert data1["users"][0]["userName"] == "Dr. Sanjay Mehrotra"

    resp2 = client.get("/users/segmentation?days=30")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["totalClusters"] == 1
    assert data2["clusters"][0]["clusterName"] == "Executive & Strategic Decision Makers"
    from app.fabric_client import FabricSqlClient

    client = FabricSqlClient(get_settings())
    attempts = {"n": 0}

    def flaky(sql, params):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise Exception("TCP Provider: connection timeout expired")
        return [{"ok": 1}]

    monkeypatch.setattr(client, "_run", flaky)
    rows = client.query("SELECT 1")
    assert rows == [{"ok": 1}]
    assert attempts["n"] == 2  # one quick retry recovered
