export type DashboardView = 'overview' | 'allocation' | 'pricing' | 'powerbi' | 'ml-insights' | 'user-consumption' | 'user-segmentation' | 'actions' | 'ml-guide' | 'data-agent' | 'showcase' | 'showcase-visits';
export type WindowDays = 1 | 7 | 30 | 90;

export interface UserConsumptionItem {
  userIdHash: string;
  userName: string;
  userEmail: string;
  jobTitle: string;
  department: string;
  businessUnit: string;
  teamId: string;
  projectId: string;
  costCenter: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  marketCost: number;
  negotiatedCost: number;
  requestCount: number;
  aiCredits?: number;
  clusterId?: number;
  clusterName?: string;
  primaryModel?: string;
  primaryProvider?: string;
}

export interface UserConsumptionResponse {
  totalUsers: number;
  totalTokens: number;
  totalMarketCost: number;
  totalNegotiatedCost: number;
  page: number;
  pageSize: number;
  totalPages: number;
  users: UserConsumptionItem[];
}

export interface UserClusterSummary {
  clusterId: number;
  clusterName: string;
  clusterDescription: string;
  userCount: number;
  totalTokens: number;
  totalMarketCost: number;
  avgTokensPerUser: number;
  avgCostPerUser: number;
  color: string;
  persona: string;
  topTraits: string[];
  recommendation: string;
  topUsers: UserConsumptionItem[];
}

export interface UserSegmentationResponse {
  totalUsers: number;
  totalClusters: number;
  clusters: UserClusterSummary[];
}

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

export interface ShowcaseVisit {
  id: string;
  visitDate: string;
  visitedAt: string;
  ipAddress: string;
  location: string;
  countryCode: string | null;
  timezone: string | null;
  userAgent: string;
}

export interface ShowcaseVisitsReport {
  generatedAt: string;
  days: number;
  totalVisits: number;
  uniqueVisitors: number;
  visits: ShowcaseVisit[];
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
  /** Microsoft product code: 'azure-ai-foundry' (token-billed) or 'copilot-studio' (AI-credit-billed). Null for other clouds. */
  ServiceCode?: 'azure-ai-foundry' | 'copilot-studio' | null;
  ConsumptionUnit?: 'tokens' | 'ai_credits';
  /** AI credits consumed by the row; 0 for token rows. */
  AiCredits?: number;
  /** List USD per AI credit applied to the row; 0 for token rows. */
  CreditUnitPriceUsd?: number;
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
  provider: 'aws' | 'gcp' | 'msft' | 'cps' | 'oai' | 'cld';
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

/** Static Microsoft Copilot Studio AI-credit rate facts (USD per AI credit unless noted). */
export interface CopilotStudioRateCard {
  listUsdPerCredit: number;
  negotiatedDiscountPct: number;
  negotiatedUsdPerCredit: number;
  prepaidPack: { credits: number; usdPerMonth: number; effectiveUsdPerCredit: number };
  featureRates: { feature: string; credits: string; unit: string }[];
}

export interface MlFeatureImpact {
  name: string;
  impact: string;
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
  // Descriptive guide metadata (documentation, not telemetry).
  plainSummary: string;
  algorithm: string;
  topFeatures: MlFeatureImpact[];
  outputDescription: string;
  howToUse: string;
  actionCategory: ActionCategory;
}

export type ActionCategory =
  | 'model-switch'
  | 'rate-limit'
  | 'reallocation'
  | 'throttle-guardrail'
  | 'prompt-efficiency'
  | 'chargeback'
  | 'capacity'
  | 'quota-increase'
  | 'governance';

export interface ActionChangePreview {
  kind: 'apim-policy' | 'rate-limit' | 'model-map' | 'budget-guardrail' | 'reallocation' | 'note';
  label: string;
  current: string;
  proposed: string;
}

export interface ActionPlan {
  id: string;
  category: ActionCategory;
  title: string;
  sourceUseCaseKey: string;
  sourceUseCaseTitle: string;
  sourceTable: string;
  severity: 'optimal' | 'warning' | 'alert' | 'info';
  entityType: string;
  entityId: string;
  rationale: string;
  estimatedMonthlyImpactUsd: number | null;
  estimatedAnnualImpactUsd: number | null;
  impactKind: 'savings' | 'cost-avoidance' | 'reliability' | 'governance';
  confidence: number | null;
  changes: ActionChangePreview[];
  metrics: { label: string; value: string }[];
}

export interface ActionCategorySummary {
  category: ActionCategory;
  title: string;
  planCount: number;
  estimatedAnnualImpactUsd: number;
}

export interface ActionRecommendationsResponse {
  generatedAt: string;
  windowDays: WindowDays;
  currency: string;
  status: 'available' | 'empty' | 'unavailable';
  detail: string;
  totalEstimatedAnnualSavingsUsd: number;
  totalEstimatedMonthlySavingsUsd: number;
  categories: ActionCategorySummary[];
  plans: ActionPlan[];
}

export interface SavedPrompt {
  id: string;
  title: string;
  category: 'Executive & FinOps' | 'Cost Anomalies & Spikes' | 'Model Optimization' | 'Quota & Capacity' | 'Prompt Quality' | 'Model Pricing' | 'Business Ontology';
  prompt: string;
  description: string;
  targetTables: string[];
  suggestedDimensions: string[];
  isCustom?: boolean;
}

export interface ChatChart {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  labels: string[];
  values: number[];
  valueLabel: string;
}

export interface ChatTable {
  title?: string;
  headers: string[];
  rows: string[][];
  chart?: ChatChart;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  timestamp: string;
  content: string;
  htmlContent?: string;
  tables?: ChatTable[];
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
