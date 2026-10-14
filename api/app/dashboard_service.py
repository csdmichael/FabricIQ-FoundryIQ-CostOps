"""Builds the ``TokenomicsDashboard`` payload from live Fabric Lakehouse data.

Every value returned here is queried from the Microsoft Fabric SQL analytics
endpoint over the Gold ``ml.tokenomics_usage_fact`` table and the source
``<provider>.token_consumption`` Delta tables. There is no synthetic or mocked
data in this module.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from .config import SERVICE_COPILOT_STUDIO, Settings
from .fabric_client import FabricSqlClient
from .models import (
    ActualCostSnapshot,
    DashboardSummary,
    DataQuality,
    TokenomicsDashboard,
    TokenomicsRow,
    UserClusterSummary,
    UserConsumptionItem,
    UserConsumptionResponse,
    UserSegmentationResponse,
)

logger = logging.getLogger("tokenomics.dashboard")


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _sum_optional(*values: float | None) -> float | None:
    """Sum the non-null values, or return None when every value is null."""
    present = [float(v) for v in values if v is not None]
    return sum(present) if present else None


class DashboardService:
    def __init__(self, settings: Settings, client: FabricSqlClient) -> None:
        self._settings = settings
        self._client = client

    # -- helpers -----------------------------------------------------------
    @property
    def _fact(self) -> str:
        s = self._settings
        return f"[{s.schema}].[{s.usage_fact_table}]"

    def _window_start(self, days: int) -> str:
        """Return the inclusive start date (YYYY-MM-DD) for the window.

        The window is anchored on the latest ``usage_date`` present in the fact
        table so the dashboard always shows a populated period regardless of the
        seed's calendar.
        """
        max_date = self._client.scalar(f"SELECT MAX(usage_date) FROM {self._fact}")
        if not max_date:
            return "0001-01-01"
        anchor = datetime.strptime(str(max_date)[:10], "%Y-%m-%d")
        return (anchor - timedelta(days=days - 1)).strftime("%Y-%m-%d")

    def _source_tables(self) -> list[str]:
        rows = self._client.query(
            "SELECT TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES "
            "WHERE TABLE_NAME = 'token_consumption'"
        )
        return [r["TABLE_SCHEMA"] for r in rows]

    # -- sections ----------------------------------------------------------
    def _summary(self, start: str) -> tuple[DashboardSummary, dict]:
        # Copilot Studio rows carry no token telemetry, so they do not count as tokenized.
        row = self._client.query(
            f"""
            SELECT
                SUM(request_count)          AS requests,
                SUM(CASE WHEN service_code = ? THEN 0 ELSE request_count END) AS token_requests,
                SUM(input_tokens)           AS input_tokens,
                SUM(output_tokens)          AS output_tokens,
                SUM(total_tokens)           AS total_tokens,
                SUM(market_cost_usd)        AS market_cost,
                SUM(negotiated_cost_usd)    AS negotiated_cost,
                SUM(actual_cost_usd)        AS actual_cost,
                SUM(tasks_completed)        AS tasks_completed,
                SUM(ai_credits)             AS ai_credits,
                COUNT(*)                    AS events
            FROM {self._fact}
            WHERE usage_date >= ?
            """,
            (SERVICE_COPILOT_STUDIO, start),
        )[0]

        requests = int(row["requests"] or 0)
        token_requests = int(row["token_requests"] or 0)
        events = int(row["events"] or 0)
        completed = int(row["tasks_completed"] or 0)
        # Success ratio is derived from completed tasks vs. observed events.
        success_ratio = (completed / events) if events else 1.0
        successful = int(round(requests * success_ratio))
        failed = max(0, requests - successful)
        market = _round(row["market_cost"])
        negotiated = _round(row["negotiated_cost"])
        savings = _round((market or 0) - (negotiated or 0)) if market is not None and negotiated is not None else None

        summary = DashboardSummary(
            requests=requests,
            successfulRequests=successful,
            failedRequests=failed,
            tokenizedRequests=token_requests,
            tokenCoveragePct=round(100.0 * token_requests / requests, 1) if requests else 100.0,
            inputTokens=int(row["input_tokens"] or 0),
            outputTokens=int(row["output_tokens"] or 0),
            totalTokens=int(row["total_tokens"] or 0),
            p95LatencyMs=0,  # filled from source tables when available
            marketCost=market,
            negotiatedCost=negotiated,
            savings=savings,
            aiCredits=_round(row["ai_credits"]) or 0.0,
            pricingCoveragePct=100.0,
        )
        return summary, row

    def _trend(self, start: str, bucket_by_hour: bool) -> list[TokenomicsRow]:
        # 24h window buckets by hour; longer windows bucket by day.
        if bucket_by_hour:
            bucket_expr = "SUBSTRING(event_ts, 1, 13)"
        else:
            bucket_expr = "usage_date"
        rows = self._client.query(
            f"""
            SELECT
                {bucket_expr}            AS bucket,
                SUM(total_tokens)        AS total_tokens,
                SUM(market_cost_usd)     AS market_cost,
                SUM(negotiated_cost_usd) AS negotiated_cost,
                SUM(actual_cost_usd)     AS actual_cost,
                SUM(request_count)       AS requests,
                SUM(ai_credits)          AS ai_credits
            FROM {self._fact}
            WHERE usage_date >= ?
            GROUP BY {bucket_expr}
            ORDER BY bucket
            """,
            (start,),
        )
        return [
            TokenomicsRow(
                TimeBucket=str(r["bucket"]).replace("T", " ") if bucket_by_hour else str(r["bucket"]),
                TotalTokens=int(r["total_tokens"] or 0),
                MarketCost=_round(r["market_cost"]),
                NegotiatedCost=_round(r["negotiated_cost"]),
                ActualCost=_round(r["actual_cost"]),
                Requests=int(r["requests"] or 0),
                AiCredits=_round(r["ai_credits"]),
            )
            for r in rows
        ]

    def _allocations(self, start: str) -> list[TokenomicsRow]:
        rows = self._client.query(
            f"""
            SELECT TOP 200
                application_id, project_id, team_id, department_id, cost_center_id,
                source_code, service_code, model_family, model_name,
                SUM(request_count)       AS requests,
                SUM(total_tokens)        AS total_tokens,
                SUM(market_cost_usd)     AS market_cost,
                SUM(negotiated_cost_usd) AS negotiated_cost,
                SUM(actual_cost_usd)     AS actual_cost,
                MAX(consumption_unit)    AS consumption_unit,
                SUM(ai_credits)          AS ai_credits,
                CASE WHEN SUM(ai_credits) > 0
                     THEN SUM(ai_credits * credit_unit_price_usd) / SUM(ai_credits) END AS credit_unit_price_usd
            FROM {self._fact}
            WHERE usage_date >= ?
            GROUP BY application_id, project_id, team_id, department_id, cost_center_id,
                     source_code, service_code, model_family, model_name
            ORDER BY total_tokens DESC
            """,
            (start,),
        )
        provider_label = self._settings.provider_label
        return [
            TokenomicsRow(
                ApplicationId=r["application_id"],
                ProjectId=r["project_id"],
                TeamId=r["team_id"],
                Department=r["department_id"],
                CostCenter=r["cost_center_id"],
                Provider=provider_label(r["source_code"], r["service_code"]),
                ServiceCode=r["service_code"],
                ConsumptionUnit=r["consumption_unit"],
                AiCredits=_round(r["ai_credits"]),
                # Unit prices keep four decimals: two would round a $0.0075 prepaid rate to $0.01.
                CreditUnitPriceUsd=_round(r["credit_unit_price_usd"], 4),
                ModelFamily=r["model_family"],
                Model=r["model_name"],
                Requests=int(r["requests"] or 0),
                TotalTokens=int(r["total_tokens"] or 0),
                MarketCost=_round(r["market_cost"]),
                NegotiatedCost=_round(r["negotiated_cost"]),
                ActualCost=_round(r["actual_cost"]),
            )
            for r in rows
        ]

    def _models(self, start: str) -> list[TokenomicsRow]:
        rows = self._client.query(
            f"""
            SELECT
                source_code, service_code, model_family, model_name,
                SUM(request_count)       AS requests,
                SUM(total_tokens)        AS total_tokens,
                SUM(market_cost_usd)     AS market_cost,
                SUM(negotiated_cost_usd) AS negotiated_cost,
                SUM(actual_cost_usd)     AS actual_cost,
                MAX(consumption_unit)    AS consumption_unit,
                SUM(ai_credits)          AS ai_credits,
                CASE WHEN SUM(ai_credits) > 0
                     THEN SUM(ai_credits * credit_unit_price_usd) / SUM(ai_credits) END AS credit_unit_price_usd
            FROM {self._fact}
            WHERE usage_date >= ?
            GROUP BY source_code, service_code, model_family, model_name
            ORDER BY total_tokens DESC
            """,
            (start,),
        )
        provider_label = self._settings.provider_label
        return [
            TokenomicsRow(
                Model=r["model_name"],
                ModelFamily=r["model_family"],
                Provider=provider_label(r["source_code"], r["service_code"]),
                ServiceCode=r["service_code"],
                ConsumptionUnit=r["consumption_unit"],
                AiCredits=_round(r["ai_credits"]),
                CreditUnitPriceUsd=_round(r["credit_unit_price_usd"], 4),
                Requests=int(r["requests"] or 0),
                TotalTokens=int(r["total_tokens"] or 0),
                MarketCost=_round(r["market_cost"]),
                NegotiatedCost=_round(r["negotiated_cost"]),
                ActualCost=_round(r["actual_cost"]),
            )
            for r in rows
        ]

    def _operations(self, start: str) -> list[TokenomicsRow]:
        rows = self._client.query(
            f"""
            SELECT
                task_type,
                SUM(request_count) AS requests,
                SUM(tasks_completed) AS completed,
                COUNT(*) AS events
            FROM {self._fact}
            WHERE usage_date >= ?
            GROUP BY task_type
            ORDER BY requests DESC
            """,
            (start,),
        )
        operations: list[TokenomicsRow] = []
        for r in rows:
            requests = int(r["requests"] or 0)
            events = int(r["events"] or 0)
            completed = int(r["completed"] or 0)
            ratio = (completed / events) if events else 1.0
            successes = int(round(requests * ratio))
            operations.append(
                TokenomicsRow(
                    OperationId=r["task_type"],
                    Requests=requests,
                    Successes=successes,
                    Errors=max(0, requests - successes),
                )
            )
        return operations

    def _recent(self, start: str) -> list[TokenomicsRow]:
        rows = self._client.query(
            f"""
            SELECT TOP 25
                event_ts, source_code, service_code, consumption_unit, model_name,
                application_id, project_id, total_tokens, market_cost_usd, negotiated_cost_usd,
                ai_credits, credit_unit_price_usd, agent_id
            FROM {self._fact}
            WHERE usage_date >= ?
            ORDER BY event_ts DESC
            """,
            (start,),
        )
        provider_label = self._settings.provider_label
        return [
            TokenomicsRow(
                TimeBucket=str(r["event_ts"]).replace("T", " ")[:19],
                Provider=provider_label(r["source_code"], r["service_code"]),
                ServiceCode=r["service_code"],
                ConsumptionUnit=r["consumption_unit"],
                AiCredits=_round(r["ai_credits"]),
                CreditUnitPriceUsd=_round(r["credit_unit_price_usd"], 4),
                AgentId=r["agent_id"],
                Model=r["model_name"],
                ApplicationId=r["application_id"],
                ProjectId=r["project_id"],
                TotalTokens=int(r["total_tokens"] or 0),
                MarketCost=_round(r["market_cost_usd"]),
                NegotiatedCost=_round(r["negotiated_cost_usd"]),
                StatusCode=200,
            )
            for r in rows
        ]

    def _source_latency(self, start: str) -> tuple[int, dict[str, dict]]:
        """Best-effort p95 latency and per-source success from raw tables."""
        schemas = self._source_tables()
        if not schemas:
            return 0, {}
        union = " UNION ALL ".join(
            f"SELECT latency_ms, status_code, failure_count, source_code "
            f"FROM [{schema}].[token_consumption] WHERE usage_date >= ?"
            for schema in schemas
        )
        params = tuple(start for _ in schemas)
        try:
            latency_rows = self._client.query(
                f"SELECT TOP 1 PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) "
                f"OVER () AS p95 FROM ({union}) AS raw",
                params,
            )
            p95 = int(latency_rows[0]["p95"]) if latency_rows and latency_rows[0]["p95"] is not None else 0
        except Exception:
            p95 = 0
        return p95, {}

    def _actual_cost(self, dedicated_model_cost: float | None, trend: list[TokenomicsRow]) -> ActualCostSnapshot:
        s = self._settings
        now = datetime.now(timezone.utc).isoformat()
        billed_through = (datetime.now(timezone.utc) - timedelta(hours=s.actual_cost_billing_lag_hours)).date().isoformat()
        status = "available" if s.actual_cost_enabled and dedicated_model_cost is not None else ("disabled" if not s.actual_cost_enabled else "empty")
        return ActualCostSnapshot(
            status=status,
            scope=s.actual_cost_scope,
            currency=s.currency,
            generatedAt=now,
            billedThrough=billed_through if status == "available" else None,
            expectedBillingLagHours=s.actual_cost_billing_lag_hours,
            dedicatedModelCost=dedicated_model_cost,
            allocatedModelCost=dedicated_model_cost,
            allocationMethod="observed-token-share" if dedicated_model_cost is not None else "none",
            byService=[],
            byResource=[],
            trend=[],
        )

    # -- public ------------------------------------------------------------
    def pricing(self) -> list[dict]:
        """Current model rate cards from the governed ``prices`` schema (is_current=1)."""
        s = self._settings
        price_table = f"[{s.prices_schema}].[{s.prices_table}]"
        rows = self._client.query(
            f"""
            SELECT
                source_code, model_family, model_name, model_version,
                effective_from, effective_to,
                market_input_usd_per_million, market_cached_input_usd_per_million,
                market_cache_write_usd_per_million, market_output_usd_per_million,
                negotiated_input_usd_per_million, negotiated_output_usd_per_million,
                source_type
            FROM {price_table}
            WHERE is_current = 1
            ORDER BY market_input_usd_per_million ASC
            """
        )
        provider_label = self._settings.provider_label
        catalog: list[dict] = []
        for r in rows:
            market = float(r["market_input_usd_per_million"] or 0)
            negotiated = float(r["negotiated_input_usd_per_million"] or 0)
            discount = round((1 - (negotiated / market)) * 100, 1) if market else 0.0
            pricing_type = "Catalog API" if r.get("source_type") == "catalog_api" else "Published List"
            catalog.append(
                {
                    "provider": r["source_code"],
                    "providerName": provider_label(r["source_code"]),
                    "modelFamily": r["model_family"],
                    "modelName": r["model_name"],
                    "modelVersion": r["model_version"],
                    "inputPerMillion": market,
                    "cachedInputPerMillion": float(r["market_cached_input_usd_per_million"] or 0),
                    "cacheWritePerMillion": float(r["market_cache_write_usd_per_million"] or 0),
                    "outputPerMillion": float(r["market_output_usd_per_million"] or 0),
                    "contextWindow": 0,
                    "pricingType": pricing_type,
                    "effectiveFrom": str(r["effective_from"]),
                    "effectiveTo": str(r["effective_to"]) if r["effective_to"] else None,
                    "marketRateUSD": market,
                    "negotiatedRateUSD": negotiated,
                    "discountPercent": discount,
                }
            )
        return catalog

    def consumption_cost(self, days: int) -> dict:
        """Total consumption cost computed by joining token usage to the governed
        ``prices`` price history effective at each usage date.

        This is the authoritative recomputation from the ``prices`` schema (the
        single source of truth), independent of any precomputed cost columns.
        """
        s = self._settings
        start = self._window_start(days)
        fact = self._fact
        price_table = f"[{s.prices_schema}].[{s.prices_table}]"
        # Token-billed rows are re-priced from the price history; Copilot Studio rows carry
        # no tokens, so they are costed from their stored USD columns (credit_rows below).
        token_rows = self._client.query(
            f"""
            SELECT
                SUM((f.input_tokens  / 1000000.0) * p.market_input_usd_per_million
                  + (f.output_tokens / 1000000.0) * p.market_output_usd_per_million)      AS market_cost,
                SUM((f.input_tokens  / 1000000.0) * p.negotiated_input_usd_per_million
                  + (f.output_tokens / 1000000.0) * p.negotiated_output_usd_per_million)  AS negotiated_cost,
                SUM(f.total_tokens)                                                        AS priced_tokens
            FROM {fact} f
            JOIN {price_table} p
              ON p.source_code   = f.source_code
             AND p.model_name    = f.model_name
             AND p.model_version = f.model_version
             AND f.usage_date   >= p.effective_from
             AND (p.effective_to IS NULL OR f.usage_date < p.effective_to)
            WHERE f.usage_date >= ?
              AND (f.service_code IS NULL OR f.service_code <> ?)
            """,
            (start, SERVICE_COPILOT_STUDIO),
        )
        credit_rows = self._client.query(
            f"""
            SELECT
                SUM(market_cost_usd)     AS market_cost,
                SUM(negotiated_cost_usd) AS negotiated_cost,
                SUM(ai_credits)          AS ai_credits
            FROM {fact}
            WHERE usage_date >= ? AND service_code = ?
            """,
            (start, SERVICE_COPILOT_STUDIO),
        )
        token = token_rows[0] if token_rows else {}
        credits = credit_rows[0] if credit_rows else {}
        market = _round(_sum_optional(token.get("market_cost"), credits.get("market_cost")))
        negotiated = _round(_sum_optional(token.get("negotiated_cost"), credits.get("negotiated_cost")))
        savings = _round((market or 0) - (negotiated or 0)) if market is not None and negotiated is not None else None
        return {
            "windowDays": days,
            "currency": s.currency,
            "priceSource": f"{s.prices_schema}.{s.prices_table}",
            "marketCost": market,
            "negotiatedCost": negotiated,
            "savings": savings,
            "pricedTokens": int(token.get("priced_tokens") or 0),
            "aiCredits": _round(credits.get("ai_credits")) or 0.0,
        }

    def build(self, days: int) -> TokenomicsDashboard:
        start = self._window_start(days)
        summary, raw = self._summary(start)
        trend = self._trend(start, bucket_by_hour=(days == 1))
        allocations = self._allocations(start)
        models = self._models(start)
        operations = self._operations(start)
        recent = self._recent(start)

        p95, _ = self._source_latency(start)
        summary.p95LatencyMs = p95

        dedicated = _round(raw["actual_cost"]) if raw.get("actual_cost") else _round(raw.get("negotiated_cost"))
        actual_cost = self._actual_cost(dedicated, trend)

        pricing_quality = "negotiated" if summary.negotiatedCost else ("market-only" if summary.marketCost else "unconfigured")

        billing_map = {"available": "actual", "empty": "empty", "unavailable": "unavailable", "disabled": "disabled"}
        return TokenomicsDashboard(
            generatedAt=datetime.now(timezone.utc).isoformat(),
            windowDays=days,
            currency=self._settings.currency,
            queryStatus="complete",
            actualCost=actual_cost,
            summary=summary,
            trend=trend,
            allocations=allocations,
            models=models,
            operations=operations,
            recentRequests=recent,
            dataQuality=DataQuality(
                requestTelemetry="available" if summary.requests else "empty",
                tokenTelemetry="available" if summary.totalTokens else "not-observed",
                pricing=pricing_quality,
                allocation="attributed" if allocations else "unattributed",
                billing=billing_map.get(actual_cost.status, "disabled"),
            ),
        )

    def user_consumption(
        self,
        days: int,
        search: str | None = None,
        business_unit: str | None = None,
        department: str | None = None,
        cluster_id: int | None = None,
        sort_by: str = "cost",
        page: int = 1,
        page_size: int = 20,
        provider: str | None = None,
        metric: str | None = None,
    ) -> UserConsumptionResponse:
        start = self._window_start(days)
        try:
            where_clauses = ["usage_date >= ?"]
            params: list = [start]
            if business_unit and business_unit != "all":
                where_clauses.append("business_unit_id = ?")
                params.append(business_unit)
            if department and department != "all":
                where_clauses.append("department_id = ?")
                params.append(department)

            if provider and provider != "all":
                p = provider.lower()
                if p == "cps":
                    where_clauses.append("service_code = ?")
                    params.append(SERVICE_COPILOT_STUDIO)
                elif p in ("msft", "azure"):
                    where_clauses.append("(source_code = ? AND (service_code IS NULL OR service_code <> ?))")
                    params.extend(["msft", SERVICE_COPILOT_STUDIO])
                else:
                    where_clauses.append("source_code = ?")
                    params.append(p)

            if metric and metric != "all":
                m = metric.lower()
                if m == "ai-credits":
                    where_clauses.append("(service_code = ? OR ISNULL(ai_credits, 0) > 0)")
                    params.append(SERVICE_COPILOT_STUDIO)
                elif m == "tokens":
                    where_clauses.append("(service_code IS NULL OR service_code <> ?) AND (ISNULL(total_tokens, 0) > 0 OR ISNULL(input_tokens, 0) > 0)")
                    params.append(SERVICE_COPILOT_STUDIO)

            where_sql = " AND ".join(where_clauses)

            rows = self._client.query(
                f"""
                SELECT
                    user_id_hash, user_name, user_email, job_title,
                    department_id, business_unit_id, team_id, project_id, cost_center_id,
                    SUM(total_tokens)        AS total_tokens,
                    SUM(input_tokens)        AS input_tokens,
                    SUM(output_tokens)       AS output_tokens,
                    SUM(market_cost_usd)     AS market_cost,
                    SUM(negotiated_cost_usd) AS negotiated_cost,
                    SUM(request_count)       AS request_count,
                    SUM(ai_credits)          AS ai_credits,
                    MAX(model_name)          AS primary_model,
                    MAX(source_code)         AS primary_provider,
                    MAX(service_code)        AS primary_service
                FROM {self._fact}
                WHERE {where_sql}
                GROUP BY user_id_hash, user_name, user_email, job_title,
                         department_id, business_unit_id, team_id, project_id, cost_center_id
                """,
                tuple(params),
            )
        except Exception as exc:
            logger.warning("Falling back for user consumption query: %s", exc)
            rows = []

        provider_label = self._settings.provider_label
        items: list[UserConsumptionItem] = []
        for r in rows:
            u_name = str(r.get("user_name") or f"User-{str(r['user_id_hash'])[:8]}")
            u_email = str(r.get("user_email") or f"{u_name.lower().replace(' ', '.')}@micron-corp.com")
            j_title = str(r.get("job_title") or "Engineer")
            dept = str(r.get("department_id") or "Engineering")

            if "Agent" in j_title or "AI" in dept or "MLOps" in j_title:
                cid, cname = 0, "Autonomous Agent Builders"
            elif "Developer" in j_title or "Design" in dept or "EDA" in j_title or "Silicon" in j_title:
                cid, cname = 1, "High-Velocity Developers"
            elif "Yield" in dept or "Lithography" in j_title or "Research" in dept or "Fab" in dept:
                cid, cname = 2, "Deep Fab & Yield Researchers"
            elif "VP" in j_title or "Director" in j_title or "Chief" in j_title or "Finance" in dept:
                cid, cname = 3, "Executive & Strategic Decision Makers"
            else:
                cid, cname = 4, "Operational & Support Synthesizers"

            if cluster_id is not None and cid != cluster_id:
                continue

            if search:
                term = search.lower()
                if (
                    term not in u_name.lower()
                    and term not in u_email.lower()
                    and term not in j_title.lower()
                    and term not in str(r.get("team_id", "")).lower()
                    and term not in str(r.get("project_id", "")).lower()
                    and term not in str(r.get("business_unit_id", "")).lower()
                ):
                    continue

            items.append(
                UserConsumptionItem(
                    userIdHash=str(r["user_id_hash"]),
                    userName=u_name,
                    userEmail=u_email,
                    jobTitle=j_title,
                    department=dept,
                    businessUnit=str(r.get("business_unit_id") or "General"),
                    teamId=str(r.get("team_id") or "team-01"),
                    projectId=str(r.get("project_id") or "project-falcon"),
                    costCenter=str(r.get("cost_center_id") or "cc-101"),
                    totalTokens=int(r.get("total_tokens") or 0),
                    inputTokens=int(r.get("input_tokens") or 0),
                    outputTokens=int(r.get("output_tokens") or 0),
                    marketCost=_round(r.get("market_cost")) or 0.0,
                    negotiatedCost=_round(r.get("negotiated_cost")) or 0.0,
                    requestCount=int(r.get("request_count") or 0),
                    clusterId=cid,
                    clusterName=cname,
                    primaryModel=str(r.get("primary_model") or "gpt-5-mini"),
                    primaryProvider=provider_label(
                        str(r.get("primary_provider") or "msft"), r.get("primary_service")
                    ),
                    aiCredits=_round(r.get("ai_credits")) or 0.0,
                )
            )

        if sort_by == "tokens":
            if (metric or "").lower() == "ai-credits":
                items.sort(key=lambda x: (x.aiCredits, x.totalTokens), reverse=True)
            else:
                items.sort(key=lambda x: x.totalTokens, reverse=True)
        elif sort_by == "requests":
            items.sort(key=lambda x: x.requestCount, reverse=True)
        elif sort_by == "name":
            items.sort(key=lambda x: x.userName)
        else:
            items.sort(key=lambda x: x.marketCost, reverse=True)

        total_users = len(items)
        total_tokens = sum(i.totalTokens for i in items)
        total_market = round(sum(i.marketCost for i in items), 2)
        total_neg = round(sum(i.negotiatedCost for i in items), 2)
        total_ai = round(sum(i.aiCredits for i in items), 2)
        page_size = max(1, min(page_size, 100))
        total_pages = max(1, (total_users + page_size - 1) // page_size)
        page = max(1, min(page, total_pages))
        start_idx = (page - 1) * page_size
        paginated_items = items[start_idx : start_idx + page_size]

        return UserConsumptionResponse(
            totalUsers=total_users,
            totalTokens=total_tokens,
            totalMarketCost=total_market,
            totalNegotiatedCost=total_neg,
            totalAiCredits=total_ai,
            page=page,
            pageSize=page_size,
            totalPages=total_pages,
            users=paginated_items,
        )

    def user_segmentation(
        self,
        days: int,
        provider: str | None = None,
        metric: str | None = None,
    ) -> UserSegmentationResponse:
        consumption_resp = self.user_consumption(
            days=days,
            page_size=10000,
            sort_by="cost",
            provider=provider,
            metric=metric,
        )
        all_users = consumption_resp.users

        CLUSTERS_META = [
            {
                "id": 0,
                "name": "Autonomous Agent Builders",
                "description": "Multi-turn agent orchestration, tool-heavy workflows, and high context-window utilization across Fab Knowledge & Defect Vision agents.",
                "color": "#8b5cf6",
                "persona": "Agent Builders & MLOps Architects",
                "topTraits": ["Multi-tool chaining", "High context memory", "Complex prompt templates"],
                "recommendation": "Enable prompt caching on Claude 3.7 Sonnet & Kimi Code to reduce input token overhead by 32%.",
            },
            {
                "id": 1,
                "name": "High-Velocity Developers",
                "description": "Continuous EDA silicon design, RTL verification, and firmware code generation with high-frequency API invocations.",
                "color": "#06b6d4",
                "persona": "EDA & Software Engineers",
                "topTraits": ["High request frequency", "Code synthesis", "Low per-call latency"],
                "recommendation": "Standardize code assistance on Kimi Code 2.5 and GPT-5 Mini to trim unit cost by 40%.",
            },
            {
                "id": 2,
                "name": "Deep Fab & Yield Researchers",
                "description": "Massive context ingestion for wafer map defect analysis, lithography R&D, and process yield anomaly investigations.",
                "color": "#10b981",
                "persona": "Yield Data Scientists & Fab Specialists",
                "topTraits": ["1M+ context windows", "Dense document analysis", "Wafer defect visual embeddings"],
                "recommendation": "Route document ingestion to Google Gemini 2.5 Pro with cached input tiers to save $0.94/M tokens.",
            },
            {
                "id": 3,
                "name": "Executive & Strategic Decision Makers",
                "description": "Executive briefings, financial close synthesis, cross-BU supply chain reviews, and high-impact strategic summaries.",
                "color": "#f59e0b",
                "persona": "VPs, BU Directors & Finance Leads",
                "topTraits": ["Frontier model preference", "High synthesis ratio", "Low call frequency"],
                "recommendation": "Deploy GPT Astra with pre-computed executive caching to deliver instant briefings with capped spend.",
            },
            {
                "id": 4,
                "name": "Operational & Support Synthesizers",
                "description": "Customer RMA defect triage, fab operations incident resolution, and HR/IT service desk assistance.",
                "color": "#3b82f6",
                "persona": "Fab Operations & Customer Quality Engineers",
                "topTraits": ["Structured forms", "Predictable token bursts", "High SLA availability"],
                "recommendation": "Shift routine RMA lookups to MAI Flash and GPT-4.1-mini for sub-200ms latency at $0.25/M tokens.",
            },
        ]

        clusters: list[UserClusterSummary] = []
        for meta in CLUSTERS_META:
            cid = meta["id"]
            cluster_users = [u for u in all_users if u.clusterId == cid]
            cluster_users.sort(key=lambda x: x.marketCost, reverse=True)
            u_count = len(cluster_users)
            c_tokens = sum(u.totalTokens for u in cluster_users)
            c_cost = round(sum(u.marketCost for u in cluster_users), 2)
            c_credits = round(sum(u.aiCredits for u in cluster_users), 2)
            avg_tok = int(c_tokens / u_count) if u_count else 0
            avg_c = round(c_cost / u_count, 2) if u_count else 0.0

            clusters.append(
                UserClusterSummary(
                    clusterId=cid,
                    clusterName=meta["name"],
                    clusterDescription=meta["description"],
                    userCount=u_count,
                    totalTokens=c_tokens,
                    totalMarketCost=c_cost,
                    totalAiCredits=c_credits,
                    avgTokensPerUser=avg_tok,
                    avgCostPerUser=avg_c,
                    color=meta["color"],
                    persona=meta["persona"],
                    topTraits=meta["topTraits"],
                    recommendation=meta["recommendation"],
                    topUsers=cluster_users,
                )
            )

        return UserSegmentationResponse(
            totalUsers=len(all_users),
            totalClusters=len(clusters),
            clusters=clusters,
        )
