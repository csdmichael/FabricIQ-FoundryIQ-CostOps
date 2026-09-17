export type DashboardView = 'overview' | 'allocation' | 'quality';
export type WindowDays = 1 | 7 | 30 | 90;

export interface RuntimeConfig {
  apiBaseUrl: string;
  tenantId: string;
  clientId: string;
  scope: string;
  demoMode: boolean;
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

export const demoDashboard: TokenomicsDashboard = {
  generatedAt: new Date().toISOString(),
  windowDays: 30,
  currency: 'USD',
  queryStatus: 'complete',
  summary: {
    requests: 12_840,
    successfulRequests: 12_394,
    failedRequests: 446,
    tokenizedRequests: 10_966,
    tokenCoveragePct: 85.4,
    inputTokens: 198_720_000,
    outputTokens: 49_880_000,
    totalTokens: 248_600_000,
    p95LatencyMs: 2_420,
    marketCost: 23_600,
    negotiatedCost: 18_700,
    savings: 4_900,
    pricingCoveragePct: 100,
  },
  trend: [
    { TimeBucket: '2026-08-19', Requests: 2840, TotalTokens: 51_400_000, MarketCost: 5100, NegotiatedCost: 4100, Model: 'gpt-4o-mini' },
    { TimeBucket: '2026-08-26', Requests: 3020, TotalTokens: 58_900_000, MarketCost: 5600, NegotiatedCost: 4450, Model: 'gpt-4o-mini' },
    { TimeBucket: '2026-09-02', Requests: 3180, TotalTokens: 63_200_000, MarketCost: 5900, NegotiatedCost: 4620, Model: 'gpt-4.1-mini' },
    { TimeBucket: '2026-09-09', Requests: 3800, TotalTokens: 75_100_000, MarketCost: 7000, NegotiatedCost: 5530, Model: 'gpt-4.1-mini' },
  ],
  allocations: [
    { ApplicationId: 'Parts Copilot', ProjectId: 'Supply continuity', TeamId: 'Operations', CostCenter: 'CC-410', Requests: 4250, TotalTokens: 82_100_000, MarketCost: 7800, NegotiatedCost: 6150, Model: 'gpt-4.1-mini' },
    { ApplicationId: 'Data Agent', ProjectId: 'Shortage intelligence', TeamId: 'Planning', CostCenter: 'CC-205', Requests: 3480, TotalTokens: 71_800_000, MarketCost: 6800, NegotiatedCost: 5410, Model: 'gpt-4o-mini' },
    { ApplicationId: 'Lakehouse Analyst', ProjectId: 'Inventory health', TeamId: 'Finance', CostCenter: 'CC-330', Requests: 2980, TotalTokens: 58_400_000, MarketCost: 5500, NegotiatedCost: 4360, Model: 'gpt-4o-mini' },
    { ApplicationId: 'Executive Briefing', ProjectId: 'Leadership reporting', TeamId: 'Strategy', CostCenter: 'CC-100', Requests: 2130, TotalTokens: 36_300_000, MarketCost: 3500, NegotiatedCost: 2780, Model: 'gpt-4.1-mini' },
  ],
  models: [
    { Model: 'gpt-4o-mini', Requests: 6940, PromptTokens: 105_400_000, CompletionTokens: 24_800_000, TotalTokens: 130_200_000, MarketCost: 10_900, NegotiatedCost: 8500 },
    { Model: 'gpt-4.1-mini', Requests: 4026, PromptTokens: 93_320_000, CompletionTokens: 25_080_000, TotalTokens: 118_400_000, MarketCost: 12_700, NegotiatedCost: 10_200 },
  ],
  operations: [
    { ApiId: 'fabric-data-agent-obo', OperationId: 'query', Requests: 5790, Successes: 5590, Errors: 200, P95LatencyMs: 2680 },
    { ApiId: 'fabric-lakehouse-obo', OperationId: 'query', Requests: 4320, Successes: 4164, Errors: 156, P95LatencyMs: 2240 },
    { ApiId: 'fabric-lakehouse-obo', OperationId: 'tables', Requests: 2730, Successes: 2640, Errors: 90, P95LatencyMs: 740 },
  ],
  recentRequests: [
    { TimeBucket: '2026-09-17T16:42:10Z', ApplicationId: 'Parts Copilot', ApiId: 'fabric-data-agent-obo', OperationId: 'query', StatusCode: 200, UserIdHash: '63b87d9c1e5a8b224a047bef', CorrelationId: '71a4c89d' },
    { TimeBucket: '2026-09-17T16:41:46Z', ApplicationId: 'Lakehouse Analyst', ApiId: 'fabric-lakehouse-obo', OperationId: 'query', StatusCode: 200, UserIdHash: 'b5c9d3218a4e98c2025cb6dc', CorrelationId: 'af39e171' },
    { TimeBucket: '2026-09-17T16:39:12Z', ApplicationId: 'Data Agent', ApiId: 'fabric-data-agent-obo', OperationId: 'query', StatusCode: 429, UserIdHash: '63b87d9c1e5a8b224a047bef', CorrelationId: '3df4b920' },
  ],
  dataQuality: {
    requestTelemetry: 'available',
    tokenTelemetry: 'available',
    pricing: 'negotiated',
    allocation: 'attributed',
  },
};