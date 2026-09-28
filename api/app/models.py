"""Pydantic response models mirroring the UI ``TokenomicsDashboard`` contract."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class TokenomicsRow(BaseModel):
    Section: Optional[str] = None
    TimeBucket: Optional[str] = None
    Requests: Optional[int] = None
    Successes: Optional[int] = None
    Errors: Optional[int] = None
    TokenizedRequests: Optional[int] = None
    PromptTokens: Optional[int] = None
    CompletionTokens: Optional[int] = None
    TotalTokens: Optional[int] = None
    P95LatencyMs: Optional[int] = None
    MarketCost: Optional[float] = None
    NegotiatedCost: Optional[float] = None
    ActualCost: Optional[float] = None
    PricedTokens: Optional[int] = None
    ApplicationId: Optional[str] = None
    ProjectId: Optional[str] = None
    TeamId: Optional[str] = None
    Department: Optional[str] = None
    CostCenter: Optional[str] = None
    Provider: Optional[str] = None
    ModelFamily: Optional[str] = None
    Model: Optional[str] = None
    ModelVersion: Optional[str] = None
    OperationId: Optional[str] = None
    StatusCode: Optional[int] = None
    CorrelationId: Optional[str] = None
    UserIdHash: Optional[str] = None
    IsStream: Optional[bool] = None


class ActualCostBreakdown(BaseModel):
    name: str
    cost: float


class ActualCostTrend(BaseModel):
    date: str
    scopeCost: float
    trackedCost: float
    dedicatedModelCost: float


class ActualCostSnapshot(BaseModel):
    source: Literal["AzureCostManagement"] = "AzureCostManagement"
    queryType: Literal["ActualCost"] = "ActualCost"
    status: Literal["available", "empty", "unavailable", "disabled"]
    scope: str
    currency: str
    generatedAt: str
    billedThrough: Optional[str] = None
    expectedBillingLagHours: int
    scopeCost: Optional[float] = None
    trackedCost: Optional[float] = None
    dedicatedModelCost: Optional[float] = None
    sharedPlatformCost: Optional[float] = None
    untrackedCost: Optional[float] = None
    allocatedModelCost: Optional[float] = None
    allocationMethod: Literal["observed-token-share", "none"]
    byService: list[ActualCostBreakdown] = []
    byResource: list[ActualCostBreakdown] = []
    trend: list[ActualCostTrend] = []


class DashboardSummary(BaseModel):
    requests: int
    successfulRequests: int
    failedRequests: int
    tokenizedRequests: int
    tokenCoveragePct: float
    inputTokens: int
    outputTokens: int
    totalTokens: int
    p95LatencyMs: int
    marketCost: Optional[float] = None
    negotiatedCost: Optional[float] = None
    savings: Optional[float] = None
    pricingCoveragePct: float


class DataQuality(BaseModel):
    requestTelemetry: Literal["available", "empty"]
    tokenTelemetry: Literal["available", "not-observed"]
    pricing: Literal["negotiated", "market-only", "unconfigured", "partial"]
    allocation: Literal["attributed", "partial", "unattributed"]
    billing: Literal["actual", "empty", "unavailable", "disabled"]


class TokenomicsDashboard(BaseModel):
    generatedAt: str
    windowDays: int
    currency: str
    queryStatus: Literal["complete", "partial"]
    actualCost: ActualCostSnapshot
    summary: DashboardSummary
    trend: list[TokenomicsRow]
    allocations: list[TokenomicsRow]
    models: list[TokenomicsRow]
    operations: list[TokenomicsRow]
    recentRequests: list[TokenomicsRow]
    dataQuality: DataQuality


class PowerBiEmbedArtifact(BaseModel):
    key: str
    kind: Literal["report", "dashboard"]
    id: str
    name: str
    embedUrl: str


class PowerBiEmbedConfig(BaseModel):
    workspaceId: str
    tokenType: Literal["Aad"] = "Aad"
    reports: list[PowerBiEmbedArtifact]
    dashboards: list[PowerBiEmbedArtifact]


class ChatRequest(BaseModel):
    message: str
    threadId: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    threadId: Optional[str] = None
    citations: list[str] = []
    agent: str
    source: Literal["foundry-fabric-data-agent"] = "foundry-fabric-data-agent"


class SamplePrompt(BaseModel):
    id: str
    title: str
    category: str
    prompt: str
    description: str
    targetTables: list[str] = []
    suggestedDimensions: list[str] = []


class ActionChangePreview(BaseModel):
    kind: Literal[
        "apim-policy", "rate-limit", "model-map", "budget-guardrail", "reallocation", "note"
    ]
    label: str
    current: str
    proposed: str


class ActionPlan(BaseModel):
    id: str
    category: Literal[
        "model-switch",
        "rate-limit",
        "reallocation",
        "throttle-guardrail",
        "prompt-efficiency",
        "chargeback",
        "capacity",
        "quota-increase",
        "governance",
    ]
    title: str
    sourceUseCaseKey: str
    sourceUseCaseTitle: str
    sourceTable: str
    severity: Literal["optimal", "warning", "alert", "info"]
    entityType: str
    entityId: str
    rationale: str
    estimatedMonthlyImpactUsd: Optional[float] = None
    estimatedAnnualImpactUsd: Optional[float] = None
    impactKind: Literal["savings", "cost-avoidance", "reliability", "governance"]
    confidence: Optional[float] = None
    changes: list[ActionChangePreview] = []
    metrics: list[dict] = []


class ActionCategorySummary(BaseModel):
    category: str
    title: str
    planCount: int
    estimatedAnnualImpactUsd: float


class ActionRecommendationsResponse(BaseModel):
    generatedAt: str
    windowDays: int
    currency: str
    status: Literal["available", "empty", "unavailable"]
    detail: str = "ok"
    totalEstimatedAnnualSavingsUsd: float = 0.0
    totalEstimatedMonthlySavingsUsd: float = 0.0
    categories: list[ActionCategorySummary] = []
    plans: list[ActionPlan] = []


class ConsumptionCost(BaseModel):
    windowDays: int
    currency: str
    priceSource: str
    marketCost: Optional[float] = None
    negotiatedCost: Optional[float] = None
    savings: Optional[float] = None
    pricedTokens: int = 0


class ShowcaseVisitRequest(BaseModel):
    timezone: Optional[str] = Field(default=None, max_length=100)


class ShowcaseVisit(BaseModel):
    id: str
    visitDate: str
    visitedAt: str
    ipAddress: str
    location: str
    countryCode: Optional[str] = None
    timezone: Optional[str] = None
    userAgent: str = ""


class ShowcaseVisitsReport(BaseModel):
    generatedAt: str
    days: int
    totalVisits: int
    uniqueVisitors: int
    visits: list[ShowcaseVisit] = []
