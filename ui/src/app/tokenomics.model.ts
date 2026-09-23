export type DashboardView = 'overview' | 'allocation' | 'pricing' | 'powerbi' | 'ml-insights' | 'data-agent';
export type WindowDays = 1 | 7 | 30 | 90;

export interface RuntimeConfig {
  apiBaseUrl: string;
  tenantId: string;
  clientId: string;
  scope: string;
  environment: string;
  powerBiScope: string;
}

export interface PowerBiEmbedArtifact {
  key: string;
  kind: 'report' | 'dashboard';
  id: string;
  name: string;
  embedUrl: string;
}

export interface PowerBiEmbedConfig {
  workspaceId: string;
  tokenType: 'Aad';
  reports: PowerBiEmbedArtifact[];
  dashboards: PowerBiEmbedArtifact[];
}

export interface ChatApiResponse {
  reply: string;
  threadId: string | null;
  citations: string[];
  agent: string;
  source: string;
}

export interface PromptsApiResponse {
  welcomeMessage: string;
  agent: string;
  prompts: SavedPrompt[];
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
  Department?: string;
  CostCenter?: string;
  Provider?: string;
  ModelFamily?: string;
  Model?: string;
  ModelVersion?: string;
  ApiId?: string;
  OperationId?: string;
  StatusCode?: number;
  CorrelationId?: string;
  UserIdHash?: string;
  IsStream?: boolean;
}

export interface ModelPriceItem {
  provider: 'aws' | 'gcp' | 'msft' | 'oai' | 'cld';
  providerName: string;
  modelFamily: string;
  modelName: string;
  modelVersion: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  cacheWritePerMillion: number;
  outputPerMillion: number;
  contextWindow: number;
  pricingType: 'Catalog API' | 'Published List';
  effectiveFrom: string;
  effectiveTo: string | null;
  marketRateUSD: number;
  negotiatedRateUSD: number;
  discountPercent: number;
}

export interface MlUseCaseInfo {
  key: string;
  number: string;
  title: string;
  folderName: string;
  outputTable: string;
  summaryMetric: string;
  summaryValue: string;
  summaryUnit: string;
  riskOrStatus: 'optimal' | 'warning' | 'alert' | 'info';
  details: string;
  recommendation: string;
  estimatedAnnualSavings?: number;
  kpis: { label: string; value: string; trend?: string }[];
  metricsTable?: { dimension: string; value: string; benchmark: string; status: string }[];
}

export interface SavedPrompt {
  id: string;
  title: string;
  category: 'Executive & FinOps' | 'Cost Anomalies & Spikes' | 'Model Optimization' | 'Quota & Capacity' | 'Prompt Quality';
  prompt: string;
  description: string;
  targetTables: string[];
  suggestedDimensions: string[];
  isCustom?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  timestamp: string;
  content: string;
  sqlQuery?: string;
  daxExpression?: string;
  metrics?: { label: string; value: string }[];
  tableData?: { headers: string[]; rows: (string | number)[][] };
  recommendation?: string;
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
