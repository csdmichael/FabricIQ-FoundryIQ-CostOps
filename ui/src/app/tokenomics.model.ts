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

export interface TokenomicsDashboard {
  generatedAt: string;
  windowDays: WindowDays;
  currency: string;
  queryStatus: 'complete' | 'partial';
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
  };
}
