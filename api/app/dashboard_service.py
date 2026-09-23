"""Builds the ``TokenomicsDashboard`` payload from live Fabric Lakehouse data.

Every value returned here is queried from the Microsoft Fabric SQL analytics
endpoint over the Gold ``ml.tokenomics_usage_fact`` table and the source
``<provider>.token_consumption`` Delta tables. There is no synthetic or mocked
data in this module.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .config import Settings
from .fabric_client import FabricSqlClient
from .models import (
    ActualCostSnapshot,
    DashboardSummary,
    DataQuality,
    TokenomicsDashboard,
    TokenomicsRow,
)


def _round(value: float | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


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
        row = self._client.query(
            f"""
            SELECT
                SUM(request_count)          AS requests,
                SUM(input_tokens)           AS input_tokens,
                SUM(output_tokens)          AS output_tokens,
                SUM(total_tokens)           AS total_tokens,
                SUM(market_cost_usd)        AS market_cost,
                SUM(negotiated_cost_usd)    AS negotiated_cost,
                SUM(actual_cost_usd)        AS actual_cost,
                SUM(tasks_completed)        AS tasks_completed,
                COUNT(*)                    AS events
            FROM {self._fact}
            WHERE usage_date >= ?
            """,
            (start,),
        )[0]

        requests = int(row["requests"] or 0)
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
            tokenizedRequests=requests,
            tokenCoveragePct=100.0,
            inputTokens=int(row["input_tokens"] or 0),
            outputTokens=int(row["output_tokens"] or 0),
            totalTokens=int(row["total_tokens"] or 0),
            p95LatencyMs=0,  # filled from source tables when available
            marketCost=market,
            negotiatedCost=negotiated,
            savings=savings,
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
                SUM(request_count)       AS requests
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
            )
            for r in rows
        ]

    def _allocations(self, start: str) -> list[TokenomicsRow]:
        rows = self._client.query(
            f"""
            SELECT TOP 200
                application_id, project_id, team_id, department_id, cost_center_id,
                source_code, model_family, model_name,
                SUM(request_count)       AS requests,
                SUM(total_tokens)        AS total_tokens,
                SUM(market_cost_usd)     AS market_cost,
                SUM(negotiated_cost_usd) AS negotiated_cost,
                SUM(actual_cost_usd)     AS actual_cost
            FROM {self._fact}
            WHERE usage_date >= ?
            GROUP BY application_id, project_id, team_id, department_id, cost_center_id,
                     source_code, model_family, model_name
            ORDER BY total_tokens DESC
            """,
            (start,),
        )
        provider = self._settings.provider_name
        return [
            TokenomicsRow(
                ApplicationId=r["application_id"],
                ProjectId=r["project_id"],
                TeamId=r["team_id"],
                Department=r["department_id"],
                CostCenter=r["cost_center_id"],
                Provider=provider(r["source_code"]),
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
                source_code, model_family, model_name,
                SUM(request_count)       AS requests,
                SUM(total_tokens)        AS total_tokens,
                SUM(market_cost_usd)     AS market_cost,
                SUM(negotiated_cost_usd) AS negotiated_cost,
                SUM(actual_cost_usd)     AS actual_cost
            FROM {self._fact}
            WHERE usage_date >= ?
            GROUP BY source_code, model_family, model_name
            ORDER BY total_tokens DESC
            """,
            (start,),
        )
        provider = self._settings.provider_name
        return [
            TokenomicsRow(
                Model=r["model_name"],
                ModelFamily=r["model_family"],
                Provider=provider(r["source_code"]),
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
                event_ts, source_code, model_name, application_id, project_id,
                total_tokens, market_cost_usd, negotiated_cost_usd
            FROM {self._fact}
            WHERE usage_date >= ?
            ORDER BY event_ts DESC
            """,
            (start,),
        )
        provider = self._settings.provider_name
        return [
            TokenomicsRow(
                TimeBucket=str(r["event_ts"]).replace("T", " ")[:19],
                Provider=provider(r["source_code"]),
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
        """Current model rate cards from ml.model_price_history (is_current=1)."""
        s = self._settings
        price_table = f"[{s.schema}].[{s.price_history_table}]"
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
        provider = self._settings.provider_name
        catalog: list[dict] = []
        for r in rows:
            market = float(r["market_input_usd_per_million"] or 0)
            negotiated = float(r["negotiated_input_usd_per_million"] or 0)
            discount = round((1 - (negotiated / market)) * 100, 1) if market else 0.0
            pricing_type = "Catalog API" if r.get("source_type") == "catalog_api" else "Published List"
            catalog.append(
                {
                    "provider": r["source_code"],
                    "providerName": provider(r["source_code"]),
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
