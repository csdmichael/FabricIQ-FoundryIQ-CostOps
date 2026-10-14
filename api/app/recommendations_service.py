"""Generates data-driven FinOps action plans - the closed feedback loop.

Reads the governed ``ml.*_output`` tables produced by the 12 PySpark inference
notebooks and turns each ML signal into a concrete, reviewable action: model
switching, APIM rate-limit / token-limit changes, quota reallocation, throttle
guardrails, prompt trimming, or chargeback. Every quantitative value (entity,
current model, risk, probability, savings, predicted cost) is queried live from
the Fabric Lakehouse - nothing is mocked. When the ML tables are not yet present
the service returns an explicit ``empty`` / ``unavailable`` status the UI renders
as a clean state instead of fabricating data.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from .config import Settings
from .fabric_client import FabricError, FabricSqlClient
from .models import (
    ActionCategorySummary,
    ActionChangePreview,
    ActionPlan,
    ActionRecommendationsResponse,
    ProjectRecommendationGroup,
    RecommendationNotification,
)

logger = logging.getLogger("tokenomics.recommendations")

# Frontier -> efficient routing policy used only to render the *proposed* model
# in a model-switch preview. This is a transparent routing policy, not telemetry:
# the current model, entity, savings and probability all come from the Lakehouse.
_MODEL_DOWNGRADE = {
    "gpt-5": "gpt-4.1-mini",
    "gpt-4o": "gpt-4o-mini",
    "gpt-4.1": "gpt-4.1-mini",
    "gpt-4": "gpt-4o-mini",
    "o1": "o4-mini",
    "claude-opus": "claude-sonnet",
    "claude-3-opus": "claude-3-5-sonnet",
    "gemini-1.5-pro": "gemini-1.5-flash",
    "gemini-2.5-pro": "gemini-2.5-flash",
    "gemini-pro": "gemini-flash",
}

_CATEGORY_TITLES = {
    "model-switch": "Model Switching",
    "rate-limit": "Token & Rate Limits",
    "reallocation": "Quota Reallocation",
    "throttle-guardrail": "Throttle Guardrails",
    "prompt-efficiency": "Prompt & Context Efficiency",
    "chargeback": "Cost Reallocation & Chargeback",
    "capacity": "Capacity Planning",
    "quota-increase": "Quota Increase",
    "governance": "Governance",
}

# One generator per closed-loop action category, bound to the ML use case whose
# output table feeds it.
_GENERATORS = [
    {"use_case_key": "model-optimization-recommendation", "category": "model-switch",
     "tone": "opportunity", "impact_kind": "savings"},
    {"use_case_key": "prompt-quality-analytics", "category": "prompt-efficiency",
     "tone": "opportunity", "impact_kind": "savings"},
    {"use_case_key": "cost-attribution-chargeback", "category": "chargeback",
     "tone": "governance", "impact_kind": "governance"},
    {"use_case_key": "budget-overrun-prediction", "category": "reallocation",
     "tone": "risk", "impact_kind": "cost-avoidance"},
    {"use_case_key": "intelligent-quota-management", "category": "rate-limit",
     "tone": "risk", "impact_kind": "reliability"},
    {"use_case_key": "anomaly-detection", "category": "throttle-guardrail",
     "tone": "risk", "impact_kind": "cost-avoidance"},
]

_TOP_PER_CATEGORY = 5


def _round(value, digits: int = 2):
    if value is None:
        return None
    return round(float(value), digits)


class RecommendationsService:
    def __init__(self, settings: Settings, client: FabricSqlClient) -> None:
        self._settings = settings
        self._client = client

    # -- helpers -----------------------------------------------------------
    def _use_case_index(self) -> dict[str, dict]:
        index: dict[str, dict] = {}
        for uc in self._settings.ml_use_cases:
            key = uc.get("key")
            if key:
                index[key] = uc
        return index

    def _available_tables(self) -> set[str]:
        rows = self._client.query(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
            (self._settings.schema,),
        )
        return {str(r["TABLE_NAME"]) for r in rows}

    def _entity_label(self, row: dict) -> tuple[str, str]:
        for key, kind in (
            ("project_id", "project"),
            ("team_id", "team"),
            ("cost_center_id", "cost center"),
            ("department_id", "department"),
            ("entity_id", "entity"),
        ):
            value = row.get(key)
            if value:
                return str(value), kind
        return "unattributed", "entity"

    def _severity(self, tone: str, probability, savings) -> str:
        if tone == "risk":
            p = float(probability or 0)
            if p >= 0.8:
                return "alert"
            if p >= 0.6:
                return "warning"
            return "info"
        if tone == "governance":
            return "info"
        return "optimal" if (savings or 0) > 0 else "info"

    def _proposed_model(self, model_name: str, model_family: str) -> str:
        name = (model_name or "").lower()
        family = (model_family or "").lower()
        for needle, target in _MODEL_DOWNGRADE.items():
            if needle in name or needle in family:
                return target
        return "efficient-tier equivalent"

    def _fetch(self, table: str) -> list[dict]:
        sql = f"""
            SELECT TOP ({_TOP_PER_CATEGORY})
                entity_type,
                entity_id,
                MAX(team_id)        AS team_id,
                MAX(project_id)     AS project_id,
                MAX(department_id)  AS department_id,
                MAX(cost_center_id) AS cost_center_id,
                MAX(model_family)   AS model_family,
                MAX(model_name)     AS model_name,
                MAX(source_code)    AS source_code,
                AVG(probability)    AS probability,
                MAX(risk_score)     AS risk_score,
                SUM(estimated_savings_usd) AS estimated_savings_usd,
                SUM(predicted_cost_usd)    AS predicted_cost_usd,
                MAX(recommendation) AS recommendation
            FROM [{self._settings.schema}].[{table}]
            GROUP BY entity_type, entity_id
            ORDER BY
                SUM(ISNULL(estimated_savings_usd, 0)) + SUM(ISNULL(predicted_cost_usd, 0)) DESC
        """
        return self._client.query(sql)

    # -- change previews per category -------------------------------------
    def _build_changes(self, category: str, row: dict, entity: str, entity_kind: str) -> list[ActionChangePreview]:
        s = self._settings
        model = str(row.get("model_name") or "the current model")
        if category == "model-switch":
            proposed = self._proposed_model(row.get("model_name", ""), row.get("model_family", ""))
            return [ActionChangePreview(
                kind="model-map",
                label=f"Route {entity_kind} '{entity}' workloads",
                current=model,
                proposed=proposed,
            )]
        if category == "rate-limit":
            prob = float(row.get("probability") or 0)
            current_tpm = s.apim_model_token_limit_per_minute
            proposed_tpm = int(round(current_tpm * (1 + 0.25 * max(prob, 0.2))))
            return [
                ActionChangePreview(
                    kind="rate-limit",
                    label=f"APIM token limit (TPM) for {entity_kind} '{entity}'",
                    current=f"{current_tpm:,} tokens/min",
                    proposed=f"{proposed_tpm:,} tokens/min ahead of forecast peak",
                ),
                ActionChangePreview(
                    kind="rate-limit",
                    label="Call rate limit (rate-limit-by-key)",
                    current=f'calls="{s.apim_rate_limit_calls}" renewal-period="{s.apim_rate_limit_renewal_seconds}"',
                    proposed=f'calls="{int(round(s.apim_rate_limit_calls * (1 + 0.25 * max(prob, 0.2))))}" '
                             f'renewal-period="{s.apim_rate_limit_renewal_seconds}"',
                ),
            ]
        if category == "reallocation":
            return [ActionChangePreview(
                kind="reallocation",
                label=f"Quota for {entity_kind} '{entity}'",
                current="On track to exceed quarterly allocation",
                proposed="Reallocate headroom from under-budget projects or drop non-critical workloads to an efficient tier before the breach date",
            )]
        if category == "throttle-guardrail":
            counter = f'@(context.Request.Headers.GetValueOrDefault("x-team-id",""))'
            return [ActionChangePreview(
                kind="apim-policy",
                label=f"APIM guardrail for {entity_kind} '{entity}'",
                current="No per-identity spike cap on the tokenomics API",
                proposed=f'<rate-limit-by-key calls="30" renewal-period="60" counter-key="{counter}" />',
            )]
        if category == "prompt-efficiency":
            return [ActionChangePreview(
                kind="note",
                label=f"Prompt hygiene for {entity_kind} '{entity}'",
                current="Repeated system context, low cache reuse",
                proposed="Trim repeated context and enable prompt caching (no model or output change)",
            )]
        if category == "chargeback":
            return [ActionChangePreview(
                kind="reallocation",
                label=f"Chargeback for {entity_kind} '{entity}'",
                current="Shared platform cost not yet allocated",
                proposed="Allocate to the cost center by observed token share and publish the monthly statement",
            )]
        return []

    def _title(self, category: str, entity: str, entity_kind: str, row: dict) -> str:
        model = str(row.get("model_name") or "")
        if category == "model-switch":
            return f"Switch {entity_kind} '{entity}' off {model}" if model else f"Optimize model choice for {entity_kind} '{entity}'"
        if category == "rate-limit":
            return f"Adjust token/rate limits for {entity_kind} '{entity}'"
        if category == "reallocation":
            return f"Reallocate quota for {entity_kind} '{entity}'"
        if category == "throttle-guardrail":
            return f"Throttle anomalous usage on {entity_kind} '{entity}'"
        if category == "prompt-efficiency":
            return f"Trim prompt bloat for {entity_kind} '{entity}'"
        if category == "chargeback":
            return f"Charge back AI spend to {entity_kind} '{entity}'"
        return f"Action for {entity_kind} '{entity}'"

    # -- build -------------------------------------------------------------
    def build(self, days: int) -> ActionRecommendationsResponse:
        now = datetime.now(timezone.utc).isoformat()
        base = ActionRecommendationsResponse(
            generatedAt=now,
            windowDays=days,
            currency=self._settings.currency,
            status="empty",
            detail="No ML action signals available for the selected window.",
        )
        try:
            available = self._available_tables()
        except FabricError as exc:  # pragma: no cover - connectivity dependent
            logger.warning("Recommendations unavailable: %s", exc.reason)
            base.status = "unavailable"
            base.detail = f"{exc.reason} {exc.remediation}".strip()
            return base
        except Exception as exc:  # pragma: no cover - connectivity dependent
            logger.warning("Recommendations unavailable: %s", exc)
            base.status = "unavailable"
            base.detail = f"ml_tables_unavailable: {exc}"
            return base

        index = self._use_case_index()
        plans: list[ActionPlan] = []
        window = max(days, 1)

        for gen in _GENERATORS:
            uc = index.get(gen["use_case_key"])
            if not uc:
                continue
            table = str(uc.get("outputTableName", ""))
            if not table or table not in available:
                continue
            try:
                rows = self._fetch(table)
            except Exception as exc:  # pragma: no cover - connectivity dependent
                logger.warning("Failed to query %s: %s", table, exc)
                continue

            for i, row in enumerate(rows):
                entity, entity_kind = self._entity_label(row)
                savings = row.get("estimated_savings_usd")
                predicted = row.get("predicted_cost_usd")
                raw_impact = savings if (savings or 0) > 0 else predicted
                monthly = None
                annual = None
                if raw_impact is not None:
                    monthly = _round(float(raw_impact) / window * 30.0)
                    annual = _round((monthly or 0) * 12.0)
                probability = _round(row.get("probability"), 4)
                plans.append(ActionPlan(
                    id=f"{gen['category']}-{i + 1}",
                    category=gen["category"],
                    title=self._title(gen["category"], entity, entity_kind, row),
                    sourceUseCaseKey=gen["use_case_key"],
                    sourceUseCaseTitle=str(uc.get("displayName", gen["use_case_key"])),
                    sourceTable=f"{self._settings.schema}.{table}",
                    severity=self._severity(gen["tone"], row.get("probability"), savings),
                    entityType=entity_kind,
                    entityId=entity,
                    rationale=str(row.get("recommendation") or "").strip()
                    or f"Derived from the {uc.get('displayName', gen['use_case_key'])} inference output.",
                    estimatedMonthlyImpactUsd=monthly,
                    estimatedAnnualImpactUsd=annual,
                    impactKind=gen["impact_kind"],
                    confidence=probability,
                    changes=self._build_changes(gen["category"], row, entity, entity_kind),
                    metrics=self._plan_metrics(row),
                ))

        if not plans:
            base.status = "empty"
            return base

        # Category rollups + totals (only savings-oriented impact counts toward
        # the headline savings number; reliability/governance are shown per card).
        categories: dict[str, ActionCategorySummary] = {}
        total_annual_savings = 0.0
        total_monthly_savings = 0.0
        for plan in plans:
            summary = categories.get(plan.category)
            if summary is None:
                summary = ActionCategorySummary(
                    category=plan.category,
                    title=_CATEGORY_TITLES.get(plan.category, plan.category),
                    planCount=0,
                    estimatedAnnualImpactUsd=0.0,
                )
                categories[plan.category] = summary
            summary.planCount += 1
            summary.estimatedAnnualImpactUsd = _round(
                summary.estimatedAnnualImpactUsd + (plan.estimatedAnnualImpactUsd or 0)
            )
            if plan.impactKind in ("savings", "cost-avoidance"):
                total_annual_savings += plan.estimatedAnnualImpactUsd or 0
                total_monthly_savings += plan.estimatedMonthlyImpactUsd or 0

        # Build data-driven project recommendation groups for notifications (All, Assigned to me)
        action_label_map = {
            "model-switch": "Switch model in Foundry",
            "rate-limit": "Update token limit in APIM",
            "throttle-guardrail": "Apply budget guardrail",
            "reallocation": "Reallocate model quota",
            "prompt-efficiency": "Optimize prompt in Foundry",
            "quota-increase": "Increase Foundry quota",
            "governance": "Open governance review",
            "chargeback": "Publish chargeback statement",
            "capacity": "Provision secondary gateway capacity",
        }
        groups_by_entity: dict[str, list[RecommendationNotification]] = {}
        for plan in plans:
            item = RecommendationNotification(
                id=plan.id,
                title=plan.title,
                category=plan.category,
                mockAction=action_label_map.get(plan.category, "Execute recommendation"),
                entityId=plan.entityId,
                confidence=plan.confidence,
                estimatedAnnualImpactUsd=plan.estimatedAnnualImpactUsd,
            )
            groups_by_entity.setdefault(plan.entityId, []).append(item)

        project_groups: list[ProjectRecommendationGroup] = []
        for entity_id, recs in groups_by_entity.items():
            proj_name = entity_id.replace("-", " ").replace("_", " ").title()
            proj_id = f"PRJ-{entity_id.upper()}" if not entity_id.upper().startswith("PRJ-") else entity_id.upper()
            # Rule: Set user's bname ("myaacoub") as Owner for applications that have multiple actions
            # like model switching or token limit change, etc.
            has_multiple = len(recs) > 1
            has_multi_action_types = any(r.category in ("model-switch", "rate-limit", "throttle-guardrail", "reallocation", "prompt-efficiency") for r in recs)

            if has_multiple and has_multi_action_types:
                owner_name = "Michael Yaacoub (myaacoub)"
                owner_email = "myaacoub@microsoft.com"
            else:
                owner_name = "Avery Johnson"
                owner_email = "avery.johnson@Caldova37587778.onmicrosoft.com"

            project_groups.append(
                ProjectRecommendationGroup(
                    projectId=proj_id,
                    projectName=proj_name,
                    ownerName=owner_name,
                    ownerEmail=owner_email,
                    recommendations=recs,
                )
            )

        # Place applications assigned to myaacoub first
        project_groups.sort(
            key=lambda g: (
                0 if "myaacoub" in g.ownerName.lower() or "myaacoub" in g.ownerEmail.lower() else 1,
                -len(g.recommendations),
                g.projectName,
            )
        )

        return ActionRecommendationsResponse(
            generatedAt=now,
            windowDays=days,
            currency=self._settings.currency,
            status="available",
            detail="ok",
            totalEstimatedAnnualSavingsUsd=_round(total_annual_savings) or 0.0,
            totalEstimatedMonthlySavingsUsd=_round(total_monthly_savings) or 0.0,
            categories=sorted(
                categories.values(), key=lambda c: c.estimatedAnnualImpactUsd, reverse=True
            ),
            plans=plans,
            projectGroups=project_groups,
        )

    def _plan_metrics(self, row: dict) -> list[dict]:
        metrics: list[dict] = []
        if row.get("model_name"):
            metrics.append({"label": "Current model", "value": str(row["model_name"])})
        if row.get("source_code"):
            metrics.append({"label": "Provider", "value": str(row["source_code"]).upper()})
        risk = row.get("risk_score")
        if risk is not None:
            metrics.append({"label": "Risk score", "value": f"{float(risk):.1f}"})
        prob = row.get("probability")
        if prob is not None:
            metrics.append({"label": "Confidence", "value": f"{float(prob) * 100:.0f}%"})
        return metrics
