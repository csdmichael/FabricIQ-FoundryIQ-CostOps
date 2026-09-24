"""Function tools the Tokenomics Foundry agent calls to ground its answers.

Each tool queries the governed Fabric ``lh_tokenomics`` Lakehouse (the same Gold
and ML output tables the Fabric Data Agent uses) via the Fabric SQL analytics
endpoint. All queries are read-only aggregates with parameterized inputs — the
agent never issues raw SQL, so there is no injection surface.
"""
from __future__ import annotations

import json
from typing import Any, Callable

from .config import Settings
from .fabric_client import FabricSqlClient

# Whitelisted grouping dimensions -> column name.
_DIMENSIONS = {
    "provider": "source_code",
    "model": "model_name",
    "model_family": "model_family",
    "department": "department_id",
    "team": "team_id",
    "project": "project_id",
    "business_unit": "business_unit_id",
    "cost_center": "cost_center_id",
    "application": "application_id",
    "task_type": "task_type",
}

# Whitelisted ML insight output tables (the 12 PySpark model outputs).
_ML_INSIGHTS = {
    "anomaly_detection": "anomaly_detection_output",
    "cost_forecast": "cost_forecast_output",
    "cost_attribution_chargeback": "cost_attribution_chargeback_output",
    "user_segmentation": "user_segmentation_output",
    "token_efficiency": "token_efficiency_output",
    "budget_overrun": "budget_overrun_output",
    "model_optimization": "model_optimization_output",
    "agent_roi": "agent_roi_output",
    "quota_management": "quota_management_output",
    "prompt_quality": "prompt_quality_output",
    "capacity_planning": "capacity_planning_output",
    "executive_adoption": "executive_adoption_output",
}


class TokenomicsTools:
    def __init__(self, settings: Settings, client: FabricSqlClient) -> None:
        self._s = settings
        self._client = client

    @property
    def _fact(self) -> str:
        return f"[{self._s.schema}].[{self._s.usage_fact_table}]"

    def _window_start(self, days: int) -> str:
        max_date = self._client.scalar(f"SELECT MAX(usage_date) FROM {self._fact}")
        if not max_date:
            return "0001-01-01"
        from datetime import datetime, timedelta

        anchor = datetime.strptime(str(max_date)[:10], "%Y-%m-%d")
        return (anchor - timedelta(days=max(1, days) - 1)).strftime("%Y-%m-%d")

    # -- tool implementations --------------------------------------------
    def get_spend_summary(self, days: int = 30) -> dict:
        start = self._window_start(days)
        row = self._client.query(
            f"""
            SELECT SUM(request_count) requests, SUM(total_tokens) total_tokens,
                   SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens,
                   SUM(market_cost_usd) market_cost, SUM(negotiated_cost_usd) negotiated_cost,
                   SUM(actual_cost_usd) actual_cost
            FROM {self._fact} WHERE usage_date >= ?
            """,
            (start,),
        )[0]
        market = float(row["market_cost"] or 0)
        negotiated = float(row["negotiated_cost"] or 0)
        return {
            "windowDays": days,
            "since": start,
            "currency": self._s.currency,
            "requests": int(row["requests"] or 0),
            "totalTokens": int(row["total_tokens"] or 0),
            "inputTokens": int(row["input_tokens"] or 0),
            "outputTokens": int(row["output_tokens"] or 0),
            "marketCostUsd": round(market, 2),
            "negotiatedCostUsd": round(negotiated, 2),
            "savingsUsd": round(market - negotiated, 2),
            "actualCostUsd": round(float(row["actual_cost"] or 0), 2),
        }

    def get_top_models(self, days: int = 30, limit: int = 10) -> dict:
        start = self._window_start(days)
        limit = max(1, min(int(limit), 50))
        rows = self._client.query(
            f"""
            SELECT TOP {limit} model_family, model_name, source_code,
                   SUM(total_tokens) tokens, SUM(market_cost_usd) market_cost,
                   SUM(negotiated_cost_usd) negotiated_cost, SUM(request_count) requests
            FROM {self._fact} WHERE usage_date >= ?
            GROUP BY model_family, model_name, source_code
            ORDER BY tokens DESC
            """,
            (start,),
        )
        provider = self._s.provider_name
        return {
            "windowDays": days,
            "models": [
                {
                    "model": r["model_name"],
                    "family": r["model_family"],
                    "provider": provider(r["source_code"]),
                    "tokens": int(r["tokens"] or 0),
                    "requests": int(r["requests"] or 0),
                    "marketCostUsd": round(float(r["market_cost"] or 0), 2),
                    "negotiatedCostUsd": round(float(r["negotiated_cost"] or 0), 2),
                }
                for r in rows
            ],
        }

    def get_cost_by_dimension(self, dimension: str = "department", days: int = 30, limit: int = 15) -> dict:
        column = _DIMENSIONS.get(str(dimension).lower())
        if not column:
            return {"error": f"unknown dimension '{dimension}'", "allowed": sorted(_DIMENSIONS)}
        start = self._window_start(days)
        limit = max(1, min(int(limit), 50))
        rows = self._client.query(
            f"""
            SELECT TOP {limit} {column} AS dim, SUM(total_tokens) tokens,
                   SUM(market_cost_usd) market_cost, SUM(negotiated_cost_usd) negotiated_cost,
                   SUM(request_count) requests
            FROM {self._fact} WHERE usage_date >= ?
            GROUP BY {column} ORDER BY market_cost DESC
            """,
            (start,),
        )
        provider = self._s.provider_name
        return {
            "windowDays": days,
            "dimension": dimension,
            "rows": [
                {
                    "value": provider(r["dim"]) if column == "source_code" else r["dim"],
                    "tokens": int(r["tokens"] or 0),
                    "requests": int(r["requests"] or 0),
                    "marketCostUsd": round(float(r["market_cost"] or 0), 2),
                    "negotiatedCostUsd": round(float(r["negotiated_cost"] or 0), 2),
                }
                for r in rows
            ],
        }

    def get_ml_insight(self, insight: str, limit: int = 10) -> dict:
        table = _ML_INSIGHTS.get(str(insight).lower())
        if not table:
            return {"error": f"unknown insight '{insight}'", "allowed": sorted(_ML_INSIGHTS)}
        limit = max(1, min(int(limit), 50))
        rows = self._client.query(f"SELECT TOP {limit} * FROM [{self._s.schema}].[{table}]")
        return {"insight": insight, "table": f"{self._s.schema}.{table}", "rowCount": len(rows), "rows": rows}

    def get_model_pricing(self, limit: int = 25) -> dict:
        limit = max(1, min(int(limit), 60))
        price_table = f"[{self._s.schema}].[{self._s.price_history_table}]"
        rows = self._client.query(
            f"""
            SELECT TOP {limit} source_code, model_family, model_name,
                   market_input_usd_per_million, market_output_usd_per_million,
                   negotiated_input_usd_per_million, negotiated_output_usd_per_million
            FROM {price_table} WHERE is_current = 1
            ORDER BY market_input_usd_per_million ASC
            """
        )
        provider = self._s.provider_name
        return {
            "rateCards": [
                {
                    "provider": provider(r["source_code"]),
                    "model": r["model_name"],
                    "family": r["model_family"],
                    "marketInputPerM": float(r["market_input_usd_per_million"] or 0),
                    "marketOutputPerM": float(r["market_output_usd_per_million"] or 0),
                    "negotiatedInputPerM": float(r["negotiated_input_usd_per_million"] or 0),
                    "negotiatedOutputPerM": float(r["negotiated_output_usd_per_million"] or 0),
                }
                for r in rows
            ]
        }

    # -- dispatch --------------------------------------------------------
    def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        handler: Callable[..., dict] | None = {
            "get_spend_summary": self.get_spend_summary,
            "get_top_models": self.get_top_models,
            "get_cost_by_dimension": self.get_cost_by_dimension,
            "get_ml_insight": self.get_ml_insight,
            "get_model_pricing": self.get_model_pricing,
        }.get(name)
        if handler is None:
            return json.dumps({"error": f"unknown tool '{name}'"})
        try:
            return json.dumps(handler(**(arguments or {})), default=str)
        except Exception as exc:  # pragma: no cover - runtime dependent
            return json.dumps({"error": f"{name} failed: {exc}"})


def tool_definitions() -> list[dict]:
    """OpenAI-style function tool schemas advertised to the Foundry agent."""
    return [
        {
            "type": "function",
            "function": {
                "name": "get_spend_summary",
                "description": "Total governed AI spend and token totals across all clouds for a window.",
                "parameters": {
                    "type": "object",
                    "properties": {"days": {"type": "integer", "enum": [1, 7, 30, 90], "description": "Observation window in days"}},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_top_models",
                "description": "Top models by token consumption and cost across all clouds.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {"type": "integer", "enum": [1, 7, 30, 90]},
                        "limit": {"type": "integer", "description": "How many models to return (max 50)"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_cost_by_dimension",
                "description": "Cost and tokens grouped by an org/model dimension (department, team, project, provider, model, business_unit, cost_center, application, task_type).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "dimension": {"type": "string", "description": "One of: provider, model, model_family, department, team, project, business_unit, cost_center, application, task_type"},
                        "days": {"type": "integer", "enum": [1, 7, 30, 90]},
                        "limit": {"type": "integer"},
                    },
                    "required": ["dimension"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_ml_insight",
                "description": "Read rows from one of the 12 PySpark ML output tables (anomaly_detection, cost_forecast, cost_attribution_chargeback, user_segmentation, token_efficiency, budget_overrun, model_optimization, agent_roi, quota_management, prompt_quality, capacity_planning, executive_adoption).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "insight": {"type": "string", "description": "ML insight key, e.g. budget_overrun"},
                        "limit": {"type": "integer"},
                    },
                    "required": ["insight"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_model_pricing",
                "description": "Current multi-cloud model rate cards (market and negotiated input/output prices per million tokens).",
                "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}},
            },
        },
    ]
