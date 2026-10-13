"""Function tools the Tokenomics Foundry agent calls to ground its answers.

Each tool queries the governed Fabric ``lh_tokenomics`` Lakehouse (the same Gold
and ML output tables the Fabric Data Agent uses) via the Fabric SQL analytics
endpoint. All queries are read-only aggregates with parameterized inputs — the
agent never issues raw SQL, so there is no injection surface.
"""
from __future__ import annotations

import json
from typing import Any, Callable

from .config import SERVICE_COPILOT_STUDIO, Settings
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

# 'cps' is the provider alias for Microsoft Copilot Studio (source_code msft + service_code copilot-studio).
_COPILOT_ALIAS = "cps"
_COPILOT_CREDIT_NOTE = (
    "Microsoft Copilot Studio is billed in AI credits and has no token rate cards; "
    "use get_ai_credit_rates for its rates."
)


def _provider_code(provider: str | None) -> str:
    return str(provider or "").strip().lower()


def _float_or_none(value: Any) -> float | None:
    return None if value is None else float(value)


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
                   SUM(actual_cost_usd) actual_cost, SUM(ai_credits) ai_credits
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
            "aiCredits": round(float(row["ai_credits"] or 0), 2),
        }

    def get_top_models(self, days: int = 30, limit: int = 10) -> dict:
        start = self._window_start(days)
        limit = max(1, min(int(limit), 50))
        rows = self._client.query(
            f"""
            SELECT TOP {limit} model_family, model_name, source_code, service_code,
                   SUM(total_tokens) tokens, SUM(market_cost_usd) market_cost,
                   SUM(negotiated_cost_usd) negotiated_cost, SUM(request_count) requests,
                   SUM(ai_credits) ai_credits
            FROM {self._fact} WHERE usage_date >= ?
            GROUP BY model_family, model_name, source_code, service_code
            ORDER BY tokens DESC
            """,
            (start,),
        )
        provider_label = self._s.provider_label
        return {
            "windowDays": days,
            "models": [
                {
                    "model": r["model_name"],
                    "family": r["model_family"],
                    "provider": provider_label(r["source_code"], r["service_code"]),
                    "tokens": int(r["tokens"] or 0),
                    "requests": int(r["requests"] or 0),
                    "aiCredits": round(float(r["ai_credits"] or 0), 2),
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
        # Provider groups also split on service_code, because Azure AI Foundry and Copilot Studio both use msft.
        is_provider = column == "source_code"
        service_sql = ", service_code" if is_provider else ""
        rows = self._client.query(
            f"""
            SELECT TOP {limit} {column} AS dim{service_sql}, SUM(total_tokens) tokens,
                   SUM(market_cost_usd) market_cost, SUM(negotiated_cost_usd) negotiated_cost,
                   SUM(request_count) requests, SUM(ai_credits) ai_credits
            FROM {self._fact} WHERE usage_date >= ?
            GROUP BY {column}{service_sql} ORDER BY market_cost DESC
            """,
            (start,),
        )
        provider_label = self._s.provider_label
        return {
            "windowDays": days,
            "dimension": dimension,
            "rows": [
                {
                    "value": provider_label(r["dim"], r.get("service_code")) if is_provider else r["dim"],
                    "tokens": int(r["tokens"] or 0),
                    "requests": int(r["requests"] or 0),
                    "aiCredits": round(float(r["ai_credits"] or 0), 2),
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

    def get_model_pricing(self, limit: int = 25, provider: str | None = None) -> dict:
        limit = max(1, min(int(limit), 60))
        code = _provider_code(provider)
        if code == _COPILOT_ALIAS:
            # token_price_history has no service_code column, so cps cannot be filtered here.
            return {
                "source": f"{self._s.prices_schema}.{self._s.prices_table}",
                "rateCards": [],
                "note": _COPILOT_CREDIT_NOTE,
            }
        price_table = f"[{self._s.prices_schema}].[{self._s.prices_table}]"
        where = "WHERE is_current = 1"
        params: tuple = ()
        if code:
            where += " AND source_code = ?"
            params = (code,)
        rows = self._client.query(
            f"""
            SELECT TOP {limit} source_code, model_family, model_name, model_version,
                   market_input_usd_per_million, market_output_usd_per_million,
                   negotiated_input_usd_per_million, negotiated_output_usd_per_million,
                   effective_from, source_name
            FROM {price_table} {where}
            ORDER BY market_input_usd_per_million ASC
            """,
            params,
        )
        provider_label = self._s.provider_label
        return {
            "source": f"{self._s.prices_schema}.{self._s.prices_table}",
            "rateCards": [
                {
                    "provider": provider_label(r["source_code"]),
                    "model": r["model_name"],
                    "family": r["model_family"],
                    "version": r["model_version"],
                    "marketInputPerM": float(r["market_input_usd_per_million"] or 0),
                    "marketOutputPerM": float(r["market_output_usd_per_million"] or 0),
                    "negotiatedInputPerM": float(r["negotiated_input_usd_per_million"] or 0),
                    "negotiatedOutputPerM": float(r["negotiated_output_usd_per_million"] or 0),
                    "effectiveFrom": str(r["effective_from"]),
                    "sourceName": r.get("source_name"),
                }
                for r in rows
            ],
        }

    def get_price_changes(self, model: str | None = None, provider: str | None = None, limit: int = 25) -> dict:
        """Effective-dated price-change history from the governed prices schema."""
        limit = max(1, min(int(limit), 100))
        code = _provider_code(provider)
        if code == _COPILOT_ALIAS:
            return {
                "source": f"{self._s.prices_schema}.{self._s.prices_table}",
                "priceChanges": [],
                "note": _COPILOT_CREDIT_NOTE,
            }
        price_table = f"[{self._s.prices_schema}].[{self._s.prices_table}]"
        clauses: list[str] = []
        params: list = []
        if model:
            clauses.append("model_name = ?")
            params.append(str(model))
        if code:
            clauses.append("source_code = ?")
            params.append(code)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = self._client.query(
            f"""
            SELECT TOP {limit} source_code, model_family, model_name, model_version,
                   effective_from, effective_to, is_current,
                   market_input_usd_per_million, market_output_usd_per_million,
                   negotiated_input_usd_per_million, negotiated_output_usd_per_million,
                   source_name
            FROM {price_table} {where}
            ORDER BY model_name ASC, effective_from DESC
            """,
            tuple(params),
        )
        provider_label = self._s.provider_label
        return {
            "source": f"{self._s.prices_schema}.{self._s.prices_table}",
            "priceChanges": [
                {
                    "provider": provider_label(r["source_code"]),
                    "model": r["model_name"],
                    "version": r["model_version"],
                    "effectiveFrom": str(r["effective_from"]),
                    "effectiveTo": str(r["effective_to"]) if r["effective_to"] else None,
                    "isCurrent": bool(r["is_current"]),
                    "marketInputPerM": float(r["market_input_usd_per_million"] or 0),
                    "marketOutputPerM": float(r["market_output_usd_per_million"] or 0),
                    "negotiatedInputPerM": float(r["negotiated_input_usd_per_million"] or 0),
                    "negotiatedOutputPerM": float(r["negotiated_output_usd_per_million"] or 0),
                    "sourceName": r.get("source_name"),
                }
                for r in rows
            ],
        }

    def get_consumption_cost(self, days: int = 30) -> dict:
        """Total consumption cost for the window.

        Token-billed rows are re-priced by joining usage to the governed price history
        effective at each usage date. Copilot Studio rows carry no tokens, so they are
        costed from their stored USD columns (ai_credits x credit_unit_price_usd).
        """
        start = self._window_start(days)
        price_table = f"[{self._s.prices_schema}].[{self._s.prices_table}]"
        token_rows = self._client.query(
            f"""
            SELECT
                SUM((f.input_tokens  / 1000000.0) * p.market_input_usd_per_million
                  + (f.output_tokens / 1000000.0) * p.market_output_usd_per_million)     AS market_cost,
                SUM((f.input_tokens  / 1000000.0) * p.negotiated_input_usd_per_million
                  + (f.output_tokens / 1000000.0) * p.negotiated_output_usd_per_million) AS negotiated_cost,
                SUM(f.total_tokens) AS priced_tokens
            FROM {self._fact} f
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
            SELECT SUM(market_cost_usd) AS market_cost, SUM(negotiated_cost_usd) AS negotiated_cost,
                   SUM(ai_credits) AS ai_credits
            FROM {self._fact}
            WHERE usage_date >= ? AND service_code = ?
            """,
            (start, SERVICE_COPILOT_STUDIO),
        )
        token = token_rows[0] if token_rows else {}
        credits = credit_rows[0] if credit_rows else {}
        token_market = float(token.get("market_cost") or 0)
        token_negotiated = float(token.get("negotiated_cost") or 0)
        credit_market = float(credits.get("market_cost") or 0)
        credit_negotiated = float(credits.get("negotiated_cost") or 0)
        market = token_market + credit_market
        negotiated = token_negotiated + credit_negotiated
        return {
            "windowDays": days,
            "currency": self._s.currency,
            "priceSource": f"{self._s.prices_schema}.{self._s.prices_table}",
            "marketCostUsd": round(market, 2),
            "negotiatedCostUsd": round(negotiated, 2),
            "savingsUsd": round(market - negotiated, 2),
            "pricedTokens": int(token.get("priced_tokens") or 0),
            "copilotStudio": {
                "aiCredits": round(float(credits.get("ai_credits") or 0), 2),
                "marketCostUsd": round(credit_market, 2),
                "negotiatedCostUsd": round(credit_negotiated, 2),
            },
        }

    def get_ai_credit_rates(self, limit: int = 25, provider: str | None = None) -> dict:
        """Current AI-credit rates for credit-billed services (Microsoft Copilot Studio)."""
        limit = max(1, min(int(limit), 60))
        rate_table = f"[{self._s.prices_schema}].[{self._s.ai_credit_price_table}]"
        clauses = ["is_current = 1"]
        params: list = []
        code = _provider_code(provider)
        if code == _COPILOT_ALIAS:
            clauses.append("source_code = ? AND service_code = ?")
            params.extend(["msft", SERVICE_COPILOT_STUDIO])
        elif code:
            clauses.append("source_code = ?")
            params.append(code)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._client.query(
            f"""
            SELECT TOP {limit} source_code, service_code, pricing_unit, currency,
                   market_usd_per_credit, negotiated_usd_per_credit,
                   prepaid_pack_credits, prepaid_pack_price_usd, prepaid_effective_usd_per_credit,
                   effective_from, source_type, source_name
            FROM {rate_table} {where}
            ORDER BY source_code ASC, service_code ASC
            """,
            tuple(params),
        )
        provider_label = self._s.provider_label
        return {
            "source": f"{self._s.prices_schema}.{self._s.ai_credit_price_table}",
            "creditRates": [
                {
                    "provider": provider_label(r["source_code"], r["service_code"]),
                    "serviceCode": r["service_code"],
                    "pricingUnit": r["pricing_unit"],
                    "currency": r["currency"],
                    "marketUsdPerCredit": _float_or_none(r["market_usd_per_credit"]),
                    "negotiatedUsdPerCredit": _float_or_none(r["negotiated_usd_per_credit"]),
                    "prepaidPackCredits": _float_or_none(r["prepaid_pack_credits"]),
                    "prepaidPackPriceUsd": _float_or_none(r["prepaid_pack_price_usd"]),
                    "prepaidEffectiveUsdPerCredit": _float_or_none(r["prepaid_effective_usd_per_credit"]),
                    "effectiveFrom": str(r["effective_from"]),
                    "sourceType": r.get("source_type"),
                    "sourceName": r.get("source_name"),
                }
                for r in rows
            ],
        }

    # -- dispatch --------------------------------------------------------
    def handlers(self) -> dict[str, Callable[..., dict]]:
        """Every tool this class fulfils, keyed by the name the agent calls it by."""
        return {
            "get_spend_summary": self.get_spend_summary,
            "get_top_models": self.get_top_models,
            "get_cost_by_dimension": self.get_cost_by_dimension,
            "get_ml_insight": self.get_ml_insight,
            "get_model_pricing": self.get_model_pricing,
            "get_price_changes": self.get_price_changes,
            "get_consumption_cost": self.get_consumption_cost,
            "get_ai_credit_rates": self.get_ai_credit_rates,
        }

    def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        handler = self.handlers().get(name)
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
                "description": "Total governed AI spend and token totals across all clouds for a window. Microsoft Copilot Studio appears as AI credits (aiCredits) and dollars, with no tokens.",
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
                "description": "Top models by token consumption and cost across all clouds. Microsoft Copilot Studio is credit-billed with no tokens; see aiCredits.",
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
                "description": "Cost and tokens grouped by an org/model dimension (department, team, project, provider, model, business_unit, cost_center, application, task_type). The provider dimension reports Azure AI Foundry and Microsoft Copilot Studio separately.",
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
                "description": "Current multi-cloud token rate cards from the governed prices schema (market and negotiated input/output prices per million tokens). Optionally filter by provider code. cps (Microsoft Copilot Studio) has no token rate cards; use get_ai_credit_rates for its rates.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer"},
                        "provider": {
                            "type": "string",
                            "enum": ["aws", "gcp", "msft", "oai", "cld", "cps"],
                            "description": "Provider code: aws, gcp, msft (Azure AI Foundry and Copilot Studio are both msft), oai, cld, or cps (Copilot Studio alias)",
                        },
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_price_changes",
                "description": "Effective-dated token price-change history (when a model's token price changed, with old vs new rates) from the governed prices.token_price_history table. Filter by model and/or provider. cps (Copilot Studio) has no token price history; use get_ai_credit_rates.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "model": {"type": "string", "description": "Model name, e.g. gpt-4.1-mini"},
                        "provider": {
                            "type": "string",
                            "enum": ["aws", "gcp", "msft", "oai", "cld", "cps"],
                            "description": "Provider code: aws, gcp, msft (Azure AI Foundry and Copilot Studio are both msft), oai, cld, or cps (Copilot Studio alias)",
                        },
                        "limit": {"type": "integer"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_consumption_cost",
                "description": "Total consumption cost for a window. Token usage is re-priced live by joining usage to the governed price history effective at each usage date (market vs negotiated, and savings). Microsoft Copilot Studio is costed from its stored USD columns (ai_credits x credit_unit_price_usd), not from tokens.",
                "parameters": {
                    "type": "object",
                    "properties": {"days": {"type": "integer", "enum": [1, 7, 30, 90]}},
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_ai_credit_rates",
                "description": "Current Microsoft Copilot Studio AI-credit rates from the governed prices.ai_credit_price_history table: list (market) and negotiated USD per credit, plus the prepaid pack price and its effective USD per credit. Filter by provider code; cps narrows to Copilot Studio.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "How many rate rows to return (max 60)"},
                        "provider": {
                            "type": "string",
                            "enum": ["aws", "gcp", "msft", "oai", "cld", "cps"],
                            "description": "Provider code: msft (Azure AI Foundry and Copilot Studio are both msft), or cps for Microsoft Copilot Studio",
                        },
                    },
                },
            },
        },
    ]
