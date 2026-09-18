export type DashboardView = 'overview' | 'allocation' | 'quality';
export type WindowDays = 1 | 7 | 30 | 90;

export interface RuntimeConfig {
  apiBaseUrl: string;
  tenantId: string;
  clientId: string;
  scope: string;
  environment: string;
}

export interface TokenomicsRow {
  Section?: string;
  TimeBucket?: string;
  Requests?: number;
  Successes?: number;
  Errors?: number;
  TokenizedRequests?: number;
  PromptTokens?: number;
  CompletionTokens?: number;
  TotalTokens?: number;
  P95LatencyMs?: number;
  MarketCost?: number | null;
  NegotiatedCost?: number | null;
  ActualCost?: number | null;
  PricedTokens?: number;
  ApplicationId?: string;
  ProjectId?: string;
  TeamId?: string;
  CostCenter?: string;
  Model?: string;
  ApiId?: string;
  OperationId?: string;
  StatusCode?: number;
  CorrelationId?: string;
  UserIdHash?: string;
  IsStream?: boolean;
}

export interface ActualCostBreakdown {
  name: string;
  cost: number;
}

export interface ActualCostTrend {
  date: string;
  scopeCost: number;
  trackedCost: number;
  dedicatedModelCost: number;
}

export interface ActualCostSnapshot {
  source: 'AzureCostManagement';
  queryType: 'ActualCost';
  status: 'available' | 'empty' | 'unavailable' | 'disabled';
  scope: string;
  currency: string;
  generatedAt: string;
  billedThrough: string | null;
  expectedBillingLagHours: number;
  scopeCost: number | null;
  trackedCost: number | null;
  dedicatedModelCost: number | null;
  sharedPlatformCost: number | null;
  untrackedCost: number | null;
  allocatedModelCost: number | null;
  allocationMethod: 'observed-token-share' | 'none';
  byService: ActualCostBreakdown[];
  byResource: ActualCostBreakdown[];
  trend: ActualCostTrend[];
}

export interface TokenomicsDashboard {
  generatedAt: string;
  windowDays: WindowDays;
  currency: string;
  queryStatus: 'complete' | 'partial';
  actualCost: ActualCostSnapshot;
  summary: {
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    tokenizedRequests: number;
    tokenCoveragePct: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    p95LatencyMs: number;
    marketCost: number | null;
    negotiatedCost: number | null;
    savings: number | null;
    pricingCoveragePct: number;
  };
  trend: TokenomicsRow[];
  allocations: TokenomicsRow[];
  models: TokenomicsRow[];
  operations: TokenomicsRow[];
  recentRequests: TokenomicsRow[];
  dataQuality: {
    requestTelemetry: 'available' | 'empty';
    tokenTelemetry: 'available' | 'not-observed';
    pricing: 'negotiated' | 'market-only' | 'unconfigured' | 'partial';
    allocation: 'attributed' | 'partial' | 'unattributed';
    billing: 'actual' | 'empty' | 'unavailable' | 'disabled';
  };
}
