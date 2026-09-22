import type {
  ChatMessage,
  MlUseCaseInfo,
  ModelPriceItem,
  SavedPrompt,
  TokenomicsDashboard,
  TokenomicsRow,
  WindowDays
} from './tokenomics.model';

export const MODEL_PRICING_CATALOG: ModelPriceItem[] = [
  {
    provider: 'aws',
    providerName: 'AWS Bedrock',
    modelFamily: 'Amazon Nova',
    modelName: 'amazon.nova-pro-v1',
    modelVersion: '1.0',
    inputPerMillion: 0.80,
    cachedInputPerMillion: 0.20,
    cacheWritePerMillion: 0.80,
    outputPerMillion: 3.20,
    contextWindow: 300000,
    pricingType: 'Catalog API',
    effectiveFrom: '2025-01-01T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 0.80,
    negotiatedRateUSD: 0.704,
    discountPercent: 12
  },
  {
    provider: 'aws',
    providerName: 'AWS Bedrock',
    modelFamily: 'Claude (Bedrock)',
    modelName: 'anthropic.claude-3-7-sonnet',
    modelVersion: '20250219-v1',
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    cacheWritePerMillion: 3.75,
    outputPerMillion: 15.00,
    contextWindow: 200000,
    pricingType: 'Catalog API',
    effectiveFrom: '2025-02-19T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 3.00,
    negotiatedRateUSD: 2.64,
    discountPercent: 12
  },
  {
    provider: 'aws',
    providerName: 'AWS Bedrock',
    modelFamily: 'Meta Llama',
    modelName: 'meta.llama3-3-70b-instruct',
    modelVersion: '1.0',
    inputPerMillion: 0.72,
    cachedInputPerMillion: 0.18,
    cacheWritePerMillion: 0.72,
    outputPerMillion: 0.72,
    contextWindow: 128000,
    pricingType: 'Catalog API',
    effectiveFrom: '2024-12-01T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 0.72,
    negotiatedRateUSD: 0.6336,
    discountPercent: 12
  },
  {
    provider: 'gcp',
    providerName: 'GCP Vertex AI',
    modelFamily: 'Gemini',
    modelName: 'gemini-2.5-pro',
    modelVersion: '002',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.31,
    cacheWritePerMillion: 1.25,
    outputPerMillion: 10.00,
    contextWindow: 1048576,
    pricingType: 'Catalog API',
    effectiveFrom: '2025-03-01T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 1.25,
    negotiatedRateUSD: 1.10,
    discountPercent: 12
  },
  {
    provider: 'gcp',
    providerName: 'GCP Vertex AI',
    modelFamily: 'Gemini',
    modelName: 'gemini-2.5-flash',
    modelVersion: '002',
    inputPerMillion: 0.30,
    cachedInputPerMillion: 0.08,
    cacheWritePerMillion: 0.30,
    outputPerMillion: 2.50,
    contextWindow: 1048576,
    pricingType: 'Catalog API',
    effectiveFrom: '2025-03-01T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 0.30,
    negotiatedRateUSD: 0.264,
    discountPercent: 12
  },
  {
    provider: 'gcp',
    providerName: 'GCP Vertex AI',
    modelFamily: 'Claude (Vertex)',
    modelName: 'claude-3-5-sonnet-v2',
    modelVersion: '20241022',
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    cacheWritePerMillion: 3.75,
    outputPerMillion: 15.00,
    contextWindow: 200000,
    pricingType: 'Catalog API',
    effectiveFrom: '2024-10-22T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 3.00,
    negotiatedRateUSD: 2.64,
    discountPercent: 12
  },
  {
    provider: 'msft',
    providerName: 'Azure OpenAI / Foundry',
    modelFamily: 'GPT-5',
    modelName: 'gpt-5.6-sol',
    modelVersion: '2026-07-09',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.13,
    cacheWritePerMillion: 1.25,
    outputPerMillion: 10.00,
    contextWindow: 400000,
    pricingType: 'Catalog API',
    effectiveFrom: '2026-07-09T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 1.25,
    negotiatedRateUSD: 1.10,
    discountPercent: 12
  },
  {
    provider: 'msft',
    providerName: 'Azure OpenAI / Foundry',
    modelFamily: 'GPT-4.1',
    modelName: 'gpt-4.1-mini',
    modelVersion: '2025-04-14',
    inputPerMillion: 0.40,
    cachedInputPerMillion: 0.10,
    cacheWritePerMillion: 0.40,
    outputPerMillion: 1.60,
    contextWindow: 1047576,
    pricingType: 'Catalog API',
    effectiveFrom: '2025-04-14T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 0.40,
    negotiatedRateUSD: 0.352,
    discountPercent: 12
  },
  {
    provider: 'oai',
    providerName: 'OpenAI Direct',
    modelFamily: 'GPT-5',
    modelName: 'gpt-5',
    modelVersion: '2025-08-07',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.13,
    cacheWritePerMillion: 1.25,
    outputPerMillion: 10.00,
    contextWindow: 400000,
    pricingType: 'Published List',
    effectiveFrom: '2025-08-07T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 1.25,
    negotiatedRateUSD: 1.10,
    discountPercent: 12
  },
  {
    provider: 'oai',
    providerName: 'OpenAI Direct',
    modelFamily: 'o-series',
    modelName: 'o4-mini',
    modelVersion: '2025-04-16',
    inputPerMillion: 1.10,
    cachedInputPerMillion: 0.28,
    cacheWritePerMillion: 1.10,
    outputPerMillion: 4.40,
    contextWindow: 200000,
    pricingType: 'Published List',
    effectiveFrom: '2025-04-16T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 1.10,
    negotiatedRateUSD: 0.968,
    discountPercent: 12
  },
  {
    provider: 'cld',
    providerName: 'Anthropic Claude',
    modelFamily: 'Claude 4',
    modelName: 'claude-opus-4-1',
    modelVersion: '20250805',
    inputPerMillion: 15.00,
    cachedInputPerMillion: 1.50,
    cacheWritePerMillion: 18.75,
    outputPerMillion: 75.00,
    contextWindow: 200000,
    pricingType: 'Published List',
    effectiveFrom: '2025-08-05T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 15.00,
    negotiatedRateUSD: 13.20,
    discountPercent: 12
  },
  {
    provider: 'cld',
    providerName: 'Anthropic Claude',
    modelFamily: 'Claude 4',
    modelName: 'claude-sonnet-4',
    modelVersion: '20250514',
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    cacheWritePerMillion: 3.75,
    outputPerMillion: 15.00,
    contextWindow: 200000,
    pricingType: 'Published List',
    effectiveFrom: '2025-05-14T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 3.00,
    negotiatedRateUSD: 2.64,
    discountPercent: 12
  },
  {
    provider: 'cld',
    providerName: 'Anthropic Claude',
    modelFamily: 'Claude 3.5',
    modelName: 'claude-3-5-haiku',
    modelVersion: '20241022',
    inputPerMillion: 0.80,
    cachedInputPerMillion: 0.08,
    cacheWritePerMillion: 1.00,
    outputPerMillion: 4.00,
    contextWindow: 200000,
    pricingType: 'Published List',
    effectiveFrom: '2024-10-22T00:00:00Z',
    effectiveTo: null,
    marketRateUSD: 0.80,
    negotiatedRateUSD: 0.704,
    discountPercent: 12
  }
];

export const ML_USE_CASES: MlUseCaseInfo[] = [
  {
    key: 'anomaly-detection',
    number: '01',
    title: 'Anomaly Detection',
    folderName: '01 - Anomaly Detection',
    outputTable: 'ml.anomaly_detection_output',
    summaryMetric: 'Spike Anomalies Detected',
    summaryValue: '14',
    summaryUnit: 'events (30d)',
    riskOrStatus: 'warning',
    details: 'Isolation Forest and Seasonal-Trend Decomposition (STL) identify unusual spikes in prompt tokens, sudden context expansion, or runaway loop requests across AWS Bedrock, GCP Vertex, Azure, and Direct API consumers.',
    recommendation: 'Auto-throttle 2 batch workflows in Research team consuming 14x normal baseline prompt tokens during off-peak hours.',
    kpis: [
      { label: 'High-Severity Anomalies', value: '3', trend: '-2 vs last week' },
      { label: 'Unattributed Spike Volume', value: '4.2M tokens', trend: 'Isolated' },
      { label: 'Affected Teams', value: 'Research, Customer Success' }
    ],
    metricsTable: [
      { dimension: 'Research / doc-parser-agent', value: '28.4M tokens/hr', benchmark: '1.8M normal', status: 'Alert - Loop detected' },
      { dimension: 'CustomerOps / support-copilot', value: '8.2M tokens/hr', benchmark: '2.5M normal', status: 'Warning - Context bloat' },
      { dimension: 'Engineering / test-gen-worker', value: '14.1M tokens/hr', benchmark: '4.0M normal', status: 'Warning - High retries' }
    ]
  },
  {
    key: 'cost-forecasting',
    number: '02',
    title: 'Cost Forecasting',
    folderName: '02 - Cost Forecasting',
    outputTable: 'ml.cost_forecast_output',
    summaryMetric: 'Projected 90-Day Run Rate',
    summaryValue: '$184,520',
    summaryUnit: 'USD',
    riskOrStatus: 'optimal',
    details: 'Prophet and AutoARIMA models trained on multi-cloud daily consumption predict quarterly AI cloud spend with 95% confidence intervals, accounting for seasonal patterns and team onboarding velocity.',
    recommendation: 'Current trajectory remains 7.4% under enterprise annual commitment ceiling ($200k allocated).',
    kpis: [
      { label: 'Forecast Accuracy (MAPE)', value: '3.8%' },
      { label: '30-Day Projected Spend', value: '$58,400' },
      { label: 'Growth Velocity', value: '+14.2% MoM' }
    ]
  },
  {
    key: 'cost-attribution-chargeback',
    number: '03',
    title: 'Cost Attribution & Chargeback',
    folderName: '03 - Cost Attribution and Chargeback',
    outputTable: 'ml.cost_attribution_chargeback_output',
    summaryMetric: 'Fully Attributed Cost Share',
    summaryValue: '99.4%',
    summaryUnit: 'attributed',
    riskOrStatus: 'optimal',
    details: 'Automated attribution engine joins hashed user sessions, APIM client headers, and business entity trees to attribute 100% of multi-cloud token invoices down to Department, Project, Cost Center, and Environment (Dev/Test/Prod).',
    recommendation: 'Enable automated monthly chargeback PDF generation and Fabric tenant subscription billing breakdown for Finance.',
    kpis: [
      { label: 'Active Cost Centers', value: '18' },
      { label: 'Top Consuming Dept', value: 'Engineering ($28.4k)' },
      { label: 'Unassigned Margin', value: '< 0.6%' }
    ]
  },
  {
    key: 'user-segmentation',
    number: '04',
    title: 'User Segmentation',
    folderName: '04 - User Segmentation',
    outputTable: 'ml.user_segmentation_output',
    summaryMetric: 'Identified Behavioral Clusters',
    summaryValue: '5',
    summaryUnit: 'cohorts',
    riskOrStatus: 'optimal',
    details: 'K-Means and DBSCAN cluster 500 active users into 5 distinct personas: Casual Users, Heavy Researchers, Agent Builders, Developers, and Executive Users based on token intensity, tool usage, and prompt depth.',
    recommendation: 'Migrate 42 "Heavy Researchers" from GPT-5 to Gemini 2.5 Pro with 1M context to improve document analysis efficiency.',
    kpis: [
      { label: 'Developers (Top Group)', value: '184 users (48% tokens)' },
      { label: 'Agent Builders', value: '62 users (26% tokens)' },
      { label: 'Casual / Periodic', value: '194 users (6% tokens)' }
    ]
  },
  {
    key: 'token-efficiency-scoring',
    number: '05',
    title: 'Token Efficiency Scoring',
    folderName: '05 - Token Efficiency Scoring',
    outputTable: 'ml.token_efficiency_output',
    summaryMetric: 'Enterprise Efficiency Score',
    summaryValue: '88.6',
    summaryUnit: '/ 100',
    riskOrStatus: 'optimal',
    details: 'Multi-factor scoring algorithm evaluates cost per completed task, tokens per business outcome, cache hit ratio, and tool-call efficiency to rank prompt health and application efficiency across all departments.',
    recommendation: 'Enable prompt caching across 4 internal chatbots to lift efficiency score to 94.2 and reduce input token spend by 32%.',
    kpis: [
      { label: 'Cache Hit Ratio', value: '41.2%' },
      { label: 'Avg Tokens / Task', value: '2,840' },
      { label: 'Top Efficient App', value: 'CodePilot (96.4)' }
    ]
  },
  {
    key: 'budget-overrun-prediction',
    number: '06',
    title: 'Budget Overrun Prediction',
    folderName: '06 - Budget Overrun Prediction',
    outputTable: 'ml.budget_overrun_output',
    summaryMetric: 'High-Risk Projects',
    summaryValue: '2',
    summaryUnit: 'projects > 80% risk',
    riskOrStatus: 'alert',
    details: 'Gradient Boosted Trees (XGBoost) predict which business projects will exceed quarterly token allocations based on current burn rate, team expansion velocity, agent adoption, and workload seasonality.',
    recommendation: 'Alert Project Falcon (84% overrun probability by Day 72) and Project Phoenix (81% risk) to adjust model tiers or request quota augmentation.',
    kpis: [
      { label: 'Project Falcon Risk', value: '84% (+$12.4k over)' },
      { label: 'Project Phoenix Risk', value: '81% (+$8.1k over)' },
      { label: 'Safe Projects', value: '16 / 18' }
    ]
  },
  {
    key: 'model-optimization-recommendation',
    number: '07',
    title: 'Model Optimization Recommendation Engine',
    folderName: '07 - Model Optimization Recommendation Engine',
    outputTable: 'ml.model_optimization_output',
    summaryMetric: 'Identified Annualized Savings',
    summaryValue: '$46,800',
    summaryUnit: 'annual savings (42%)',
    riskOrStatus: 'optimal',
    details: 'Natural language task classifier maps prompt embeddings and task types against model performance benchmarks. Recommends zero-quality-loss downgrades (e.g. GPT-5 -> GPT-4.1-mini or Claude Opus -> Sonnet/Nova for basic tasks).',
    recommendation: 'Switch summarization and sentiment extraction workloads from frontier models to GPT-4.1-mini and Amazon Nova Pro.',
    estimatedAnnualSavings: 46800,
    kpis: [
      { label: 'Workloads Eligible', value: '14 pipelines' },
      { label: 'Average Cost Reduction', value: '54.2%' },
      { label: 'Benchmark Quality Parity', value: '99.1%' }
    ]
  },
  {
    key: 'agent-roi-analytics',
    number: '08',
    title: 'Agent ROI Analytics',
    folderName: '08 - Agent ROI Analytics',
    outputTable: 'ml.agent_roi_output',
    summaryMetric: 'Net AI Value Generated',
    summaryValue: '4.8x',
    summaryUnit: 'ROI ratio',
    riskOrStatus: 'optimal',
    details: 'Correlates multi-cloud token cost with engineering and operational outcomes: pull requests merged, Jira tickets resolved, support response minutes saved, and hours automated per business unit.',
    recommendation: 'Double allocation for Customer Support Agent which produces 7.2x ROI by saving 420 agent hours monthly.',
    kpis: [
      { label: 'Hours Saved (Monthly)', value: '1,420 hrs' },
      { label: 'Support Tickets Automated', value: '3,840' },
      { label: 'Net Monthly Value', value: '$72,400' }
    ]
  },
  {
    key: 'intelligent-quota-management',
    number: '09',
    title: 'Intelligent Quota Management',
    folderName: '09 - Intelligent Quota Management',
    outputTable: 'ml.quota_management_output',
    summaryMetric: 'Recommended Quota Actions',
    summaryValue: '6',
    summaryUnit: 'TPM adjustments',
    riskOrStatus: 'warning',
    details: 'Predicts token-per-minute (TPM) and request-per-minute (RPM) exhaustion before gateway 429 throttling occurs, aligning upcoming sprint releases and team onboarding with capacity pools.',
    recommendation: 'Increase Azure OpenAI GPT-5.6-sol quota for Analytics team by 25k TPM ahead of Q4 reporting peak.',
    kpis: [
      { label: 'Throttling Events Avoided', value: '128' },
      { label: 'Underutilized Quota Reclaimed', value: '45k TPM' },
      { label: 'Capacity Buffer Health', value: '98.2%' }
    ]
  },
  {
    key: 'prompt-quality-analytics',
    number: '10',
    title: 'Prompt Quality Analytics',
    folderName: '10 - Prompt Quality Analytics',
    outputTable: 'ml.prompt_quality_output',
    summaryMetric: 'Prompt Bloat Identified',
    summaryValue: '38.4%',
    summaryUnit: 'context reducible',
    riskOrStatus: 'warning',
    details: 'Scans prompt length, retry counts, repeated system instructions, and excessive context windows to score prompt health and generate concrete token reduction recommendations.',
    recommendation: 'Trim repetitive system prompts in Support RAG pipeline from 34k to 8.5k tokens, saving an estimated $14,200 annually.',
    kpis: [
      { label: 'Average Prompt Tokens', value: '6,420' },
      { label: 'High-Retry Prompts (>3)', value: '4.2%' },
      { label: 'Cacheable Repetitions', value: '68%' }
    ]
  },
  {
    key: 'capacity-planning',
    number: '11',
    title: 'Capacity Planning',
    folderName: '11 - Capacity Planning',
    outputTable: 'ml.capacity_planning_output',
    summaryMetric: 'MACC Commitment Track',
    summaryValue: '104.2%',
    summaryUnit: 'on schedule',
    riskOrStatus: 'optimal',
    details: 'Forecasts enterprise multi-region infrastructure requirements (APIM gateway throughput, regional model capacity, vector search indices) across 12-month planning horizons.',
    recommendation: 'Provision secondary APIM gateway unit in East US by Nov 2026 to accommodate projected 2.4x multi-region growth.',
    kpis: [
      { label: 'Peak APIM Gateway RPS', value: '420 rps' },
      { label: 'Regional Load Balance', value: 'West US (62%), East US (38%)' },
      { label: 'MACC Spend Attainment', value: '$240k / $230k committed' }
    ]
  },
  {
    key: 'executive-ai-adoption-scorecard',
    number: '12',
    title: 'Executive AI Adoption Scorecard',
    folderName: '12 - Executive AI Adoption Scorecard',
    outputTable: 'ml.executive_adoption_output',
    summaryMetric: 'Enterprise Adoption Index',
    summaryValue: '84.2%',
    summaryUnit: 'active workforce',
    riskOrStatus: 'optimal',
    details: 'Aggregates executive KPIs into a holistic scorecard: active AI users, cost per active employee, negotiated enterprise rate savings, team rankings, and multi-cloud market share.',
    recommendation: 'Expand developer enablement workshops to Finance and Legal departments to drive targeted agent adoption.',
    kpis: [
      { label: 'Monthly Active AI Users', value: '462 / 500 (92.4%)' },
      { label: 'Cost / Active User', value: '$48.20 / mo' },
      { label: 'Total Enterprise Savings', value: '$84,200 (YTD)' }
    ]
  }
];

export const SAVED_PROMPTS_DEFAULT: SavedPrompt[] = [
  {
    id: 'exec-summary',
    title: 'Multi-Cloud AI Spend & Token Summary',
    category: 'Executive & FinOps',
    prompt: 'Summarize multi-cloud AI token consumption and spend across AWS Bedrock, GCP Vertex, Azure OpenAI, OpenAI Direct, and Anthropic Claude for the past 30 days. Break down by provider and model family.',
    description: 'Executive overview of total token volume, market cost vs negotiated cost, and provider market share.',
    targetTables: ['ml.tokenomics_usage_fact', 'ml.model_price_history'],
    suggestedDimensions: ['source_code', 'model_family', 'usage_date']
  },
  {
    id: 'budget-overrun',
    title: 'Predict Budget Overrun Risks by Project',
    category: 'Cost Anomalies & Spikes',
    prompt: 'Which projects and departments have a predicted budget overrun probability exceeding 75% for the current quarter? Show their current burn rate, predicted overrun amount, and key contributing workloads.',
    description: 'Uses Algorithm 06 (Budget Overrun Prediction) to identify high-risk cost centers before overruns happen.',
    targetTables: ['ml.budget_overrun_output', 'ml.tokenomics_usage_fact'],
    suggestedDimensions: ['project_id', 'department_id', 'risk_score']
  },
  {
    id: 'model-downgrade',
    title: 'Model Optimization & Downgrade Savings',
    category: 'Model Optimization',
    prompt: 'Identify top summarization, classification, and code-generation workloads using expensive frontier models (GPT-5, Claude Opus) where switching to efficient models (GPT-4.1-mini, Gemini 2.5 Flash, Amazon Nova) yields 40%+ savings.',
    description: 'Leverages Algorithm 07 to identify immediate dollar savings through smart model routing.',
    targetTables: ['ml.model_optimization_output', 'ml.model_price_history'],
    suggestedDimensions: ['current_model', 'recommended_model', 'annual_savings_usd']
  },
  {
    id: 'quota-forecast',
    title: 'Intelligent Quota & TPM Recommendations',
    category: 'Quota & Capacity',
    prompt: 'Show intelligent TPM and RPM quota adjustments for engineering and research teams based on growth velocity and release schedules to prevent 429 throttling.',
    description: 'Queries Algorithm 09 to review proactive capacity and quota headroom recommendations.',
    targetTables: ['ml.quota_management_output', 'ml.capacity_planning_output'],
    suggestedDimensions: ['team_id', 'model_name', 'recommended_tpm']
  },
  {
    id: 'prompt-quality',
    title: 'Analyze Prompt Bloat & Cache Hit Ratios',
    category: 'Prompt Quality',
    prompt: 'Analyze prompt quality scores across our top 10 consuming applications. List workflows with excessive context windows (>25k tokens) and calculate savings from prompt caching.',
    description: 'Runs Algorithm 10 to highlight inefficient context sizes and caching opportunities.',
    targetTables: ['ml.prompt_quality_output', 'ml.token_efficiency_output'],
    suggestedDimensions: ['application_id', 'avg_prompt_tokens', 'cache_hit_pct']
  },
  {
    id: 'agent-roi',
    title: 'AI Agent ROI & Hours Saved by Business Unit',
    category: 'Executive & FinOps',
    prompt: 'Calculate the return on investment (ROI) for all production AI agents across business units, comparing token infrastructure costs against hours saved and tickets resolved.',
    description: 'Queries Algorithm 08 (Agent ROI Analytics) for business outcome traceability.',
    targetTables: ['ml.agent_roi_output', 'ml.tokenomics_usage_fact'],
    suggestedDimensions: ['business_unit_id', 'agent_id', 'roi_ratio']
  }
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome-1',
    sender: 'agent',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content: 'Hello! I am your **Fabric Tokenomics FinOps Analyst**. I have direct access to governed Lakehouse Delta tables (`aws`, `gcp`, `msft`, `oai`, `cld`, and `ml.*`) on Microsoft Fabric. You can ask me any question about multi-cloud spend, model pricing rate cards, budget overruns, quota recommendations, or select a pre-configured prompt from the library above.',
    metrics: [
      { label: 'Governed Providers', value: '5 (AWS, GCP, Azure, OpenAI, Claude)' },
      { label: 'ML Models Active', value: '12 Production PySpark Models' },
      { label: 'Fabric Lakehouse', value: 'lh_tokenomics (Gold Schema ml.*)' }
    ]
  }
];

export function generateMockDashboard(days: WindowDays): TokenomicsDashboard {
  const multiplier = days === 1 ? 0.033 : days === 7 ? 0.233 : days === 30 ? 1.0 : 3.0;
  const requests = Math.round(452000 * multiplier);
  const successfulRequests = Math.round(requests * 0.994);
  const failedRequests = requests - successfulRequests;
  const totalTokens = Math.round(2840000000 * multiplier);
  const inputTokens = Math.round(totalTokens * 0.72);
  const outputTokens = totalTokens - inputTokens;
  const marketCost = Number((14820.50 * multiplier).toFixed(2));
  const negotiatedCost = Number((13042.04 * multiplier).toFixed(2));
  const savings = Number((marketCost - negotiatedCost).toFixed(2));
  const dedicatedModelCost = Number((12850.20 * multiplier).toFixed(2));

  const trend: TokenomicsRow[] = [];
  const points = days === 1 ? 24 : days === 7 ? 7 : days === 30 ? 30 : 90;
  const stepDays = days / points;
  const baseTime = Date.now() - days * 86400000;

  for (let i = 0; i < points; i++) {
    const time = new Date(baseTime + i * stepDays * 86400000);
    const dayVolume = (totalTokens / points) * (0.85 + Math.sin(i / 3) * 0.25);
    trend.push({
      TimeBucket: time.toISOString().slice(0, days === 1 ? 13 : 10),
      TotalTokens: Math.round(dayVolume),
      MarketCost: Number((dayVolume * 0.0000052).toFixed(2)),
      NegotiatedCost: Number((dayVolume * 0.0000046).toFixed(2)),
      ActualCost: Number((dayVolume * 0.0000045).toFixed(2)),
      Requests: Math.round(requests / points),
      Successes: Math.round((requests / points) * 0.994),
      Errors: Math.round((requests / points) * 0.006),
      P95LatencyMs: 340 + Math.round(Math.sin(i) * 45)
    });
  }

  const allocations: TokenomicsRow[] = [
    {
      ApplicationId: 'copilot-engineering',
      ProjectId: 'cloud-modernize',
      TeamId: 'platform-core',
      Department: 'Engineering',
      CostCenter: 'CC-ENG-101',
      Provider: 'Azure OpenAI',
      ModelFamily: 'GPT-5',
      Model: 'gpt-5.6-sol',
      Requests: Math.round(142000 * multiplier),
      TotalTokens: Math.round(980000000 * multiplier),
      MarketCost: Number((4410.00 * multiplier).toFixed(2)),
      NegotiatedCost: Number((3880.80 * multiplier).toFixed(2)),
      ActualCost: Number((3850.00 * multiplier).toFixed(2))
    },
    {
      ApplicationId: 'research-rag-agent',
      ProjectId: 'market-intel',
      TeamId: 'data-science',
      Department: 'Research',
      CostCenter: 'CC-RND-204',
      Provider: 'GCP Vertex AI',
      ModelFamily: 'Gemini',
      Model: 'gemini-2.5-pro',
      Requests: Math.round(98000 * multiplier),
      TotalTokens: Math.round(720000000 * multiplier),
      MarketCost: Number((3240.00 * multiplier).toFixed(2)),
      NegotiatedCost: Number((2851.20 * multiplier).toFixed(2)),
      ActualCost: Number((2810.00 * multiplier).toFixed(2))
    },
    {
      ApplicationId: 'support-chat-bot',
      ProjectId: 'customer-ops',
      TeamId: 'support-tier2',
      Department: 'Customer Success',
      CostCenter: 'CC-OPS-302',
      Provider: 'AWS Bedrock',
      ModelFamily: 'Claude (Bedrock)',
      Model: 'anthropic.claude-3-7-sonnet',
      Requests: Math.round(84000 * multiplier),
      TotalTokens: Math.round(480000000 * multiplier),
      MarketCost: Number((2640.00 * multiplier).toFixed(2)),
      NegotiatedCost: Number((2323.20 * multiplier).toFixed(2)),
      ActualCost: Number((2290.00 * multiplier).toFixed(2))
    },
    {
      ApplicationId: 'code-review-worker',
      ProjectId: 'dev-productivity',
      TeamId: 'devops-tools',
      Department: 'Engineering',
      CostCenter: 'CC-ENG-102',
      Provider: 'Anthropic Claude',
      ModelFamily: 'Claude 4',
      Model: 'claude-sonnet-4',
      Requests: Math.round(68000 * multiplier),
      TotalTokens: Math.round(390000000 * multiplier),
      MarketCost: Number((2145.00 * multiplier).toFixed(2)),
      NegotiatedCost: Number((1887.60 * multiplier).toFixed(2)),
      ActualCost: Number((1860.00 * multiplier).toFixed(2))
    },
    {
      ApplicationId: 'executive-briefing',
      ProjectId: 'strategy-ai',
      TeamId: 'executive-office',
      Department: 'Corporate',
      CostCenter: 'CC-EXEC-001',
      Provider: 'OpenAI Direct',
      ModelFamily: 'o-series',
      Model: 'o4-mini',
      Requests: Math.round(60000 * multiplier),
      TotalTokens: Math.round(270000000 * multiplier),
      MarketCost: Number((2385.50 * multiplier).toFixed(2)),
      NegotiatedCost: Number((2099.24 * multiplier).toFixed(2)),
      ActualCost: Number((2040.20 * multiplier).toFixed(2))
    }
  ];

  const models: TokenomicsRow[] = [
    { Model: 'gpt-5.6-sol', ModelFamily: 'GPT-5', Provider: 'Azure OpenAI', TotalTokens: Math.round(980000000 * multiplier), Requests: Math.round(142000 * multiplier), MarketCost: Number((4410.00 * multiplier).toFixed(2)), NegotiatedCost: Number((3880.80 * multiplier).toFixed(2)) },
    { Model: 'gemini-2.5-pro', ModelFamily: 'Gemini', Provider: 'GCP Vertex AI', TotalTokens: Math.round(720000000 * multiplier), Requests: Math.round(98000 * multiplier), MarketCost: Number((3240.00 * multiplier).toFixed(2)), NegotiatedCost: Number((2851.20 * multiplier).toFixed(2)) },
    { Model: 'anthropic.claude-3-7-sonnet', ModelFamily: 'Claude (Bedrock)', Provider: 'AWS Bedrock', TotalTokens: Math.round(480000000 * multiplier), Requests: Math.round(84000 * multiplier), MarketCost: Number((2640.00 * multiplier).toFixed(2)), NegotiatedCost: Number((2323.20 * multiplier).toFixed(2)) },
    { Model: 'claude-sonnet-4', ModelFamily: 'Claude 4', Provider: 'Anthropic Claude', TotalTokens: Math.round(390000000 * multiplier), Requests: Math.round(68000 * multiplier), MarketCost: Number((2145.00 * multiplier).toFixed(2)), NegotiatedCost: Number((1887.60 * multiplier).toFixed(2)) },
    { Model: 'o4-mini', ModelFamily: 'o-series', Provider: 'OpenAI Direct', TotalTokens: Math.round(270000000 * multiplier), Requests: Math.round(60000 * multiplier), MarketCost: Number((2385.50 * multiplier).toFixed(2)), NegotiatedCost: Number((2099.24 * multiplier).toFixed(2)) }
  ];

  const operations: TokenomicsRow[] = [
    { OperationId: 'POST /v1/chat/completions', Requests: Math.round(290000 * multiplier), Successes: Math.round(288260 * multiplier), Errors: Math.round(1740 * multiplier), P95LatencyMs: 380 },
    { OperationId: 'POST /models/invoke', Requests: Math.round(112000 * multiplier), Successes: Math.round(111440 * multiplier), Errors: Math.round(560 * multiplier), P95LatencyMs: 290 },
    { OperationId: 'POST /v1/messages', Requests: Math.round(50000 * multiplier), Successes: Math.round(49750 * multiplier), Errors: Math.round(250 * multiplier), P95LatencyMs: 320 }
  ];

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    currency: 'USD',
    queryStatus: 'complete',
    actualCost: {
      source: 'AzureCostManagement',
      queryType: 'ActualCost',
      status: 'available',
      scope: '/subscriptions/cf824570-a8ba-497a-a184-0a52f1830aa9/resourceGroups/m365-myaacoub',
      currency: 'USD',
      generatedAt: new Date().toISOString(),
      billedThrough: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      expectedBillingLagHours: 24,
      scopeCost: Number((18400.00 * multiplier).toFixed(2)),
      trackedCost: Number((14200.00 * multiplier).toFixed(2)),
      dedicatedModelCost: dedicatedModelCost,
      sharedPlatformCost: Number((1349.80 * multiplier).toFixed(2)),
      untrackedCost: Number((4200.00 * multiplier).toFixed(2)),
      allocatedModelCost: dedicatedModelCost,
      allocationMethod: 'observed-token-share',
      byService: [
        { name: 'Azure OpenAI & Foundry Services', cost: dedicatedModelCost },
        { name: 'Azure API Management (AI Gateway)', cost: Number((980.00 * multiplier).toFixed(2)) },
        { name: 'Azure App Service (CostOps UI & Host)', cost: Number((369.80 * multiplier).toFixed(2)) }
      ],
      byResource: [
        { name: 'foundry-fabric-costops', cost: dedicatedModelCost },
        { name: 'caldova-apim-westus', cost: Number((980.00 * multiplier).toFixed(2)) },
        { name: 'caldova-showcase-plan', cost: Number((369.80 * multiplier).toFixed(2)) }
      ],
      trend: trend.map(t => ({
        date: t.TimeBucket || '',
        scopeCost: Number(((t.MarketCost || 0) * 1.2).toFixed(2)),
        trackedCost: t.MarketCost || 0,
        dedicatedModelCost: t.ActualCost || 0
      }))
    },
    summary: {
      requests,
      successfulRequests,
      failedRequests,
      tokenizedRequests: requests,
      tokenCoveragePct: 100,
      inputTokens,
      outputTokens,
      totalTokens,
      p95LatencyMs: 342,
      marketCost,
      negotiatedCost,
      savings,
      pricingCoveragePct: 100
    },
    trend,
    allocations,
    models,
    operations,
    recentRequests: allocations.map((a, i) => ({
      StatusCode: 200,
      CorrelationId: `req-7f8e-${i}-${Date.now().toString(36)}`,
      TimeBucket: new Date(Date.now() - i * 1800000).toISOString().slice(11, 19),
      Model: a.Model,
      TotalTokens: Math.round((a.TotalTokens || 1000) / (a.Requests || 1)),
      P95LatencyMs: 280 + i * 35,
      TeamId: a.TeamId,
      ApplicationId: a.ApplicationId
    })),
    dataQuality: {
      requestTelemetry: 'available',
      tokenTelemetry: 'available',
      pricing: 'negotiated',
      allocation: 'attributed',
      billing: 'actual'
    }
  };
}

export function executePromptResponse(prompt: SavedPrompt): ChatMessage {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  switch (prompt.id) {
    case 'exec-summary':
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Multi-Cloud AI Consumption & Spend (Last 30 Days)\n\nQueried **\`ml.tokenomics_usage_fact\`** joined with effective-dated **\`model_price_history\`** across all 5 registered cloud providers.\n\n- **Total Governed Tokens:** **2.84 Billion tokens** across 452,000 requests.\n- **Market Benchmark Cost:** **$14,820.50 USD**\n- **Negotiated Enterprise Cost:** **$13,042.04 USD** (12% average negotiated discount)\n- **Net Cost Savings:** **$1,778.46 USD**\n- **Overall Request Success Rate:** **99.41%** (P95 latency: 342ms)`,
        sqlQuery: `SELECT \n  source_code AS Provider,\n  model_family AS ModelFamily,\n  COUNT(*) AS Requests,\n  SUM(total_tokens) AS TotalTokens,\n  ROUND(SUM(market_cost_usd), 2) AS MarketCostUSD,\n  ROUND(SUM(negotiated_cost_usd), 2) AS NegotiatedCostUSD,\n  ROUND(SUM(market_cost_usd - negotiated_cost_usd), 2) AS SavingsUSD\nFROM lh_tokenomics.ml.tokenomics_usage_fact\nWHERE usage_date >= DATEADD(day, -30, CURRENT_DATE)\nGROUP BY source_code, model_family\nORDER BY TotalTokens DESC;`,
        daxExpression: `EVALUATE\nSUMMARIZECOLUMNS(\n    'UsageFact'[source_code],\n    'UsageFact'[model_family],\n    "Total Requests", [Total Requests],\n    "Total Tokens", [Total Tokens],\n    "Market Spend", [Market Cost USD],\n    "Negotiated Spend", [Negotiated Cost USD],\n    "Enterprise Savings", [Negotiated Savings USD]\n)`,
        tableData: {
          headers: ['Provider', 'Model Family', 'Requests', 'Total Tokens', 'Market Cost', 'Negotiated Cost', 'Savings'],
          rows: [
            ['Azure OpenAI (msft)', 'GPT-5 (gpt-5.6-sol)', '142,000', '980,000,000', '$4,410.00', '$3,880.80', '$529.20'],
            ['GCP Vertex AI (gcp)', 'Gemini (gemini-2.5-pro)', '98,000', '720,000,000', '$3,240.00', '$2,851.20', '$388.80'],
            ['AWS Bedrock (aws)', 'Claude 3.7 Sonnet', '84,000', '480,000,000', '$2,640.00', '$2,323.20', '$316.80'],
            ['Anthropic (cld)', 'Claude Sonnet 4', '68,000', '390,000,000', '$2,145.00', '$1,887.60', '$257.40'],
            ['OpenAI Direct (oai)', 'o-series (o4-mini)', '60,000', '270,000,000', '$2,385.50', '$2,099.24', '$286.26']
          ]
        },
        recommendation: 'AWS Bedrock and GCP Vertex adoption increased by 22% this month. Negotiated enterprise discount sheets saved $1,778.46 across 2.84B tokens.'
      };

    case 'budget-overrun':
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Predictive Budget Overrun Report (Q3 Forecast)\n\nQueried **\`ml.budget_overrun_output\`** generated by PySpark XGBoost regression model **06 - Budget Overrun Prediction**.\n\nTwo active projects exhibit an overrun probability $> 80\\%$:`,
        sqlQuery: `SELECT \n  project_id AS Project,\n  department_id AS Department,\n  cost_center_id AS CostCenter,\n  ROUND(current_burn_rate_usd_day, 2) AS BurnRateDay,\n  ROUND(predicted_quarter_spend_usd, 2) AS ProjectedSpend,\n  budget_allocation_usd AS BudgetCap,\n  overrun_risk_score AS RiskScorePct,\n  predicted_overrun_usd AS OverrunUSD\nFROM lh_tokenomics.ml.budget_overrun_output\nWHERE overrun_risk_score >= 75\nORDER BY overrun_risk_score DESC;`,
        tableData: {
          headers: ['Project', 'Department', 'Daily Burn', 'Projected Q3 Spend', 'Budget Cap', 'Overrun Risk', 'Est. Overrun'],
          rows: [
            ['Project Falcon', 'Research', '$620.40/day', '$52,400', '$40,000', '84%', '+$12,400'],
            ['Project Phoenix', 'Customer Success', '$410.80/day', '$38,100', '$30,000', '81%', '+$8,100'],
            ['Project Titan', 'Engineering', '$820.00/day', '$74,200', '$75,000', '42%', '$0 (On Track)']
          ]
        },
        recommendation: 'Recommend applying smart model routing on Project Falcon to downgrade background summarization to GPT-4.1-mini and Gemini Flash, mitigating the estimated $12,400 overrun before quarter end.'
      };

    case 'model-downgrade':
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Model Optimization & Downgrade Recommendations\n\nQueried **\`ml.model_optimization_output\`** from **07 - Model Optimization Recommendation Engine**.\n\nAnalyzing embedding semantics and task complexity against model benchmarks identifies **$46,800 in annualized savings** by routing low-complexity tasks to high-efficiency models:`,
        sqlQuery: `SELECT \n  task_type AS TaskType,\n  current_model AS CurrentModel,\n  recommended_model AS RecommendedModel,\n  task_volume_monthly AS MonthlyRequests,\n  benchmark_quality_retention AS QualityScore,\n  estimated_annual_savings_usd AS AnnualSavingsUSD\nFROM lh_tokenomics.ml.model_optimization_output\nORDER BY estimated_annual_savings_usd DESC;`,
        tableData: {
          headers: ['Task Type', 'Current Model', 'Recommended Model', 'Monthly Vol', 'Quality Parity', 'Annual Savings'],
          rows: [
            ['Document Summarization', 'GPT-5 (gpt-5.6-sol)', 'GPT-4.1-mini', '124,000', '99.4%', '$18,600 (72% drop)'],
            ['Support Ticket Tagging', 'Claude Opus 4.1', 'Claude 3.5 Haiku', '82,000', '99.1%', '$14,200 (84% drop)'],
            ['Log & Code Parsing', 'Claude 3.7 Sonnet', 'Amazon Nova Pro', '64,000', '98.8%', '$8,400 (62% drop)'],
            ['Search Query Expansion', 'Gemini 2.5 Pro', 'Gemini 2.5 Flash', '140,000', '99.8%', '$5,600 (76% drop)']
          ]
        },
        recommendation: 'Implementing the top 4 model downgrade routes reduces annual token consumption spend by $46,800 without observable user quality degradation.'
      };

    case 'quota-forecast':
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Intelligent Quota Management & TPM Recommendations\n\nQueried **\`ml.quota_management_output\`** from **09 - Intelligent Quota Management**.\n\nIdentified 3 teams approaching TPM capacity limits and 3 teams with stranded, underutilized quota that can be reallocated:`,
        tableData: {
          headers: ['Team', 'Target Model', 'Current Assigned TPM', 'Peak Usage TPM', 'Recommended TPM', 'Action'],
          rows: [
            ['Data Science & ML', 'gpt-5.6-sol', '50,000 TPM', '48,200 TPM (96%)', '75,000 TPM', '+25k TPM Increase'],
            ['Customer Success Ops', 'claude-3-7-sonnet', '30,000 TPM', '28,900 TPM (96%)', '45,000 TPM', '+15k TPM Increase'],
            ['Legacy Billing Bot', 'gpt-4.1', '60,000 TPM', '8,200 TPM (13%)', '20,000 TPM', '-40k TPM Reclaim'],
            ['Internal Knowledge App', 'gemini-2.5-pro', '40,000 TPM', '12,400 TPM (31%)', '25,000 TPM', '-15k TPM Reclaim']
          ]
        },
        recommendation: 'Net quota balance is neutral: Reclaiming 55k TPM from underutilized internal apps fully covers the 40k TPM surge required for Analytics and Customer Ops without increasing cloud quota costs.'
      };

    case 'prompt-quality':
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Prompt Quality & Context Bloat Analysis\n\nQueried **\`ml.prompt_quality_output\`** from **10 - Prompt Quality Analytics**.\n\n- **Average Prompt Context:** 6,420 tokens\n- **Excessive Context Workloads ($>25\\text{k}$ tokens):** 14.2% of calls\n- **Identified Redundant System Context:** 38.4% of token volume\n\n**Top Bloat Candidates:**\n1. \`support-rag-agent\`: System prompt repeats 18KB static customer policy on every turn instead of utilizing Anthropic prompt caching (Potential savings: $14.2k/yr).\n2. \`code-reviewer-worker\`: Sends full repository files (42k tokens) rather than diff context (6.2k tokens).`,
        recommendation: 'Enable prompt caching headers on OpenAI and Claude endpoints to achieve 90% discount on cache read tokens.'
      };

    case 'agent-roi':
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### AI Agent ROI & Business Value Attribution\n\nQueried **\`ml.agent_roi_output\`** from **08 - Agent ROI Analytics**.\n\nOverall portfolio ROI across all 5 deployed multi-cloud agents is **4.8x net return** on token infrastructure expenditure:`,
        tableData: {
          headers: ['Agent Application', 'Department', 'Monthly Token Cost', 'Hours Saved', 'Tickets Automated', 'Net Value', 'ROI Ratio'],
          rows: [
            ['Support Copilot Tier 1', 'Customer Ops', '$2,290', '420 hrs', '3,840 tickets', '$28,400', '12.4x'],
            ['CodeReviewer Agent', 'Engineering', '$3,850', '680 hrs', '412 PRs reviewed', '$42,000', '10.9x'],
            ['Financial Research Bot', 'Finance', '$2,810', '210 hrs', '84 market decks', '$14,200', '5.0x'],
            ['Sales Proposal Generator', 'Sales', '$2,040', '110 hrs', '45 proposals', '$7,800', '3.8x']
          ]
        },
        recommendation: 'Enterprise AI agents saved an estimated 1,420 human hours this month, delivering $72,400 in net business productivity value.'
      };

    default:
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Analysis for "${prompt.title}"\n\nSuccessfully queried Fabric Lakehouse Delta tables for **${prompt.title}**.\n\n- **Data Source:** \`${prompt.targetTables.join(', ')}\`\n- **Dimensions Evaluated:** \`${prompt.suggestedDimensions.join(', ')}\`\n- **Status:** All query assertions verified against current Gold FinOps facts.`,
        recommendation: 'Live metrics match continuous PySpark ML models on Microsoft Fabric.'
      };
  }
}
