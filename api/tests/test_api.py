"""Offline tests for the Tokenomics FastAPI service.

These tests exercise config loading, response-model shaping, and endpoint wiring
without requiring Fabric connectivity (the Fabric client is stubbed).
"""
from __future__ import annotations

import json
import sys
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from app.agent_tools import TokenomicsTools, tool_definitions  # noqa: E402
from app.config import ServiceProviderInfo, get_settings  # noqa: E402
from app.dashboard_service import DashboardService  # noqa: E402
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


class _FakeFabric:
    """Stands in for FabricSqlClient: records every SQL call and replays canned rows in order."""

    def __init__(self, responses: list[list[dict]] | None = None, anchor: str = "2026-09-30") -> None:
        self.calls: list[tuple[str, tuple]] = []
        self._responses = list(responses or [])
        self._anchor = anchor

    def scalar(self, sql, params=()):
        self.calls.append((sql, tuple(params)))
        return self._anchor

    def query(self, sql, params=()):
        self.calls.append((sql, tuple(params)))
        return self._responses.pop(0) if self._responses else []


def _credit_rate_row() -> dict:
    return {
        "source_code": "msft",
        "service_code": "copilot-studio",
        "pricing_unit": "ai_credit",
        "currency": "USD",
        "market_usd_per_credit": 0.01,
        "negotiated_usd_per_credit": 0.008,
        "prepaid_pack_credits": 25000,
        "prepaid_pack_price_usd": 200.0,
        "prepaid_effective_usd_per_credit": 0.008,
        "effective_from": "2026-01-01",
        "source_type": "published_list",
        "source_name": "Microsoft Copilot Studio pricing",
    }


def _summary_row() -> dict:
    return {
        "requests": 50, "token_requests": 10, "input_tokens": 3000, "output_tokens": 2000,
        "total_tokens": 5000, "market_cost": 6.0, "negotiated_cost": 5.0, "actual_cost": None,
        "tasks_completed": 50, "ai_credits": 400.0, "events": 50,
    }


@pytest.mark.parametrize(
    ("source", "service", "expected"),
    [
        ("msft", "copilot-studio", "Microsoft Copilot Studio"),
        ("msft", "azure-ai-foundry", "Azure AI Foundry"),
        ("msft", None, "Azure AI Foundry"),
        ("msft", "", "Azure AI Foundry"),
        ("cld", None, "Anthropic Claude"),
        ("cld", "copilot-studio", "Anthropic Claude"),
        ("aws", None, "AWS Bedrock"),
        (None, None, None),
    ],
)
def test_provider_label_splits_microsoft_by_service(source, service, expected):
    assert get_settings().provider_label(source, service) == expected


def test_provider_label_falls_back_and_honours_configured_names():
    settings = get_settings()
    assert any(
        s.service_code == "copilot-studio" and s.consumption_unit == "ai_credits"
        for s in settings.service_providers
    ), "dashboardApi.serviceProviders should load from config"

    without_config = replace(settings, service_providers=[])
    assert without_config.provider_label("msft", "copilot-studio") == "Microsoft Copilot Studio"
    assert without_config.provider_label("msft", None) == "Azure AI Foundry"

    renamed = replace(
        settings,
        service_providers=[ServiceProviderInfo("copilot-studio", "msft", "Copilot Studio (EMEA)", "ai_credits")],
    )
    assert renamed.provider_label("msft", "copilot-studio") == "Copilot Studio (EMEA)"


def test_cps_alias_filters_ai_credit_rates_to_copilot_studio():
    fake = _FakeFabric(responses=[[_credit_rate_row()]])

    result = TokenomicsTools(get_settings(), fake).get_ai_credit_rates(provider=" CPS ")

    sql, params = fake.calls[0]
    assert "source_code = ? AND service_code = ?" in sql
    assert params == ("msft", "copilot-studio")
    assert "is_current = 1" in sql
    rate = result["creditRates"][0]
    assert rate["provider"] == "Microsoft Copilot Studio"
    assert rate["serviceCode"] == "copilot-studio"
    assert rate["marketUsdPerCredit"] == 0.01
    assert rate["prepaidEffectiveUsdPerCredit"] == 0.008


def test_cps_alias_does_not_query_token_price_tables():
    fake = _FakeFabric()
    tools = TokenomicsTools(get_settings(), fake)

    pricing = tools.get_model_pricing(provider="cps")
    changes = tools.get_price_changes(provider="cps", model="gpt-4.1-mini")

    assert pricing["rateCards"] == [] and "get_ai_credit_rates" in pricing["note"]
    assert changes["priceChanges"] == [] and "get_ai_credit_rates" in changes["note"]
    assert fake.calls == [], "token price history has no service_code, so cps must not query it"


def test_model_pricing_labels_msft_token_rate_cards_as_foundry():
    fake = _FakeFabric(responses=[[{
        "source_code": "msft", "model_family": "GPT", "model_name": "gpt-5-mini",
        "model_version": "2025-08-07", "market_input_usd_per_million": 0.25,
        "market_output_usd_per_million": 2.0, "negotiated_input_usd_per_million": 0.2,
        "negotiated_output_usd_per_million": 1.6, "effective_from": "2025-08-07",
        "source_name": "Azure pricing",
    }]])

    card = TokenomicsTools(get_settings(), fake).get_model_pricing(provider="msft")["rateCards"][0]

    assert card["provider"] == "Azure AI Foundry"
    sql, params = fake.calls[0]
    assert "source_code = ?" in sql and params == ("msft",)


def test_every_declared_tool_is_registered_and_credit_rates_is_read_only():
    declared = {t["function"]["name"] for t in tool_definitions()}
    tools = TokenomicsTools(get_settings(), _FakeFabric())

    assert declared == set(tools.handlers())
    assert "get_ai_credit_rates" in declared
    assert "get_ai_credit_rates" in tools.handlers()

    fake = _FakeFabric(responses=[[]])
    TokenomicsTools(get_settings(), fake).dispatch("get_ai_credit_rates", {})
    assert fake.calls[0][0].split()[0] == "SELECT"


def test_dispatch_routes_get_ai_credit_rates_as_json():
    fake = _FakeFabric(responses=[[_credit_rate_row()]])

    payload = json.loads(TokenomicsTools(get_settings(), fake).dispatch("get_ai_credit_rates", {"provider": "cps"}))

    assert payload["creditRates"][0]["provider"] == "Microsoft Copilot Studio"


def test_agent_consumption_cost_prices_copilot_studio_from_stored_usd():
    fake = _FakeFabric(responses=[
        [{"market_cost": 10.0, "negotiated_cost": 8.0, "priced_tokens": 1000}],
        [{"market_cost": 5.0, "negotiated_cost": 4.0, "ai_credits": 500.0}],
    ])

    result = TokenomicsTools(get_settings(), fake).get_consumption_cost(days=30)

    token_sql, token_params = fake.calls[1]
    credit_sql, _ = fake.calls[2]
    assert "service_code <> ?" in token_sql and token_params[-1] == "copilot-studio"
    assert "p.market_input_usd_per_million" not in credit_sql and "market_cost_usd" in credit_sql
    assert result["marketCostUsd"] == 15.0
    assert result["negotiatedCostUsd"] == 12.0
    assert result["savingsUsd"] == 3.0
    assert result["pricedTokens"] == 1000
    assert result["copilotStudio"] == {"aiCredits": 500.0, "marketCostUsd": 5.0, "negotiatedCostUsd": 4.0}


def test_dashboard_consumption_cost_adds_copilot_studio_usd_and_credits():
    fake = _FakeFabric(responses=[
        [{"market_cost": 10.0, "negotiated_cost": 8.0, "priced_tokens": 1000}],
        [{"market_cost": 5.0, "negotiated_cost": 4.0, "ai_credits": 500.0}],
    ])

    cost = DashboardService(get_settings(), fake).consumption_cost(30)

    assert cost["marketCost"] == 15.0
    assert cost["negotiatedCost"] == 12.0
    assert cost["pricedTokens"] == 1000
    assert cost["aiCredits"] == 500.0
    assert "market_cost_usd" in fake.calls[2][0]

    empty = DashboardService(get_settings(), _FakeFabric(responses=[[], []])).consumption_cost(30)
    assert empty["marketCost"] is None and empty["aiCredits"] == 0.0


def test_dashboard_build_reports_credits_coverage_and_service_labels():
    copilot_alloc = {
        "application_id": "hr-app", "project_id": "hr", "team_id": "team-1", "department_id": "HR",
        "cost_center_id": "cc-1", "source_code": "msft", "service_code": "copilot-studio",
        "model_family": "Copilot Studio", "model_name": "hr-service-agent", "requests": 40,
        "total_tokens": 0, "market_cost": 4.0, "negotiated_cost": 3.5, "actual_cost": None,
        "consumption_unit": "ai_credits", "ai_credits": 400.0, "credit_unit_price_usd": 0.01,
    }
    foundry_alloc = {
        **copilot_alloc, "service_code": "azure-ai-foundry", "model_family": "GPT",
        "model_name": "gpt-5-mini", "requests": 10, "total_tokens": 5000, "market_cost": 2.0,
        "negotiated_cost": 1.5, "consumption_unit": "tokens", "ai_credits": None,
        "credit_unit_price_usd": None,
    }
    recent = {
        "event_ts": "2026-09-30T10:00:00", "source_code": "msft", "service_code": "copilot-studio",
        "consumption_unit": "ai_credits", "model_name": "hr-service-agent", "application_id": "hr-app",
        "project_id": "hr", "total_tokens": 0, "market_cost_usd": 0.1, "negotiated_cost_usd": 0.08,
        "ai_credits": 10.0, "credit_unit_price_usd": 0.01, "agent_id": "hr-service-agent",
    }
    fake = _FakeFabric(responses=[
        [_summary_row()],
        [{"bucket": "2026-09-01", "total_tokens": 5000, "market_cost": 6.0, "negotiated_cost": 5.0,
          "actual_cost": None, "requests": 50, "ai_credits": 400.0}],
        [copilot_alloc, foundry_alloc],
        [copilot_alloc, foundry_alloc],
        [{"task_type": "summarization", "requests": 50, "completed": 50, "events": 50}],
        [recent],
        [],
    ])

    dash = DashboardService(get_settings(), fake).build(30)

    assert dash.summary.aiCredits == 400.0
    assert dash.summary.tokenizedRequests == 10
    assert dash.summary.tokenCoveragePct == 20.0
    allocations = {row.ServiceCode: row for row in dash.allocations}
    assert allocations["copilot-studio"].Provider == "Microsoft Copilot Studio"
    assert allocations["copilot-studio"].AiCredits == 400.0
    assert allocations["copilot-studio"].CreditUnitPriceUsd == 0.01
    assert allocations["azure-ai-foundry"].Provider == "Azure AI Foundry"
    assert allocations["azure-ai-foundry"].AiCredits is None
    model_sql = next(sql for sql, _ in fake.calls if "GROUP BY source_code, service_code, model_family" in sql)
    assert "GROUP BY source_code, service_code, model_family, model_name" in model_sql
    assert dash.recentRequests[0].Provider == "Microsoft Copilot Studio"
    assert dash.recentRequests[0].AgentId == "hr-service-agent"
    assert dash.recentRequests[0].ConsumptionUnit == "ai_credits"


def test_user_consumption_primary_provider_uses_service_and_totals_credits():
    def user_row(name, primary_provider, primary_service, credits):
        return {
            "user_id_hash": f"hash-{name}", "user_name": name, "user_email": f"{name}@example.com",
            "job_title": "Engineer", "department_id": "Engineering", "business_unit_id": "BU1",
            "team_id": "team-1", "project_id": "project-1", "cost_center_id": "cc-1",
            "total_tokens": 0, "input_tokens": 0, "output_tokens": 0, "market_cost": 2.0,
            "negotiated_cost": 1.5, "request_count": 20, "ai_credits": credits,
            "primary_model": "hr-service-agent", "primary_provider": primary_provider,
            "primary_service": primary_service,
        }

    fake = _FakeFabric(responses=[[
        user_row("ana", "msft", "copilot-studio", 12.5),
        user_row("ben", None, None, 0.0),
    ]])

    response = DashboardService(get_settings(), fake).user_consumption(days=30)

    users = {u.userName: u for u in response.users}
    assert users["ana"].primaryProvider == "Microsoft Copilot Studio"
    assert users["ana"].aiCredits == 12.5
    assert users["ben"].primaryProvider == "Azure AI Foundry"
    assert response.totalAiCredits == 12.5


def test_tokenomics_row_exposes_ai_credit_and_agent_fields():
    row = TokenomicsRow(
        Provider="Microsoft Copilot Studio",
        ServiceCode="copilot-studio",
        ConsumptionUnit="ai_credits",
        AiCredits=3.5,
        CreditUnitPriceUsd=0.0075,
        AgentId="hr-service-agent",
    )

    payload = row.model_dump()

    assert payload["ServiceCode"] == "copilot-studio"
    assert payload["ConsumptionUnit"] == "ai_credits"
    assert payload["AiCredits"] == 3.5
    assert payload["CreditUnitPriceUsd"] == 0.0075
    assert payload["AgentId"] == "hr-service-agent"
    assert TokenomicsRow().AgentId is None


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
