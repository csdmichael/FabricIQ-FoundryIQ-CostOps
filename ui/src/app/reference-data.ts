// Reference catalog of the 12 PySpark ML use cases surfaced in the ML Insights tab.
// This is descriptive metadata (algorithm names, folders, and Lakehouse output tables),
// not live telemetry. Quantitative dashboard, pricing, and chat data come from the
// Fabric Lakehouse via the tokenomics API.
import type { MlUseCaseInfo } from './tokenomics.model';

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
    ],
    plainSummary: 'Continuously watches every provider\u2019s token stream and flags abnormal spikes, runaway agent loops, and sudden context-window blow-ups before they turn into a surprise invoice.',
    algorithm: 'Isolation Forest + Seasonal-Trend Decomposition (STL) on hourly token and cost series.',
    topFeatures: [
      { name: 'Prompt tokens / hour vs. seasonal baseline', impact: 'Highest' },
      { name: 'Request retry count', impact: 'High' },
      { name: 'Context-window size growth', impact: 'Medium' },
      { name: 'Request rate (RPM) deviation', impact: 'Medium' }
    ],
    outputDescription: 'One row per flagged entity/window with risk_score, probability, and the offending metric measured against its STL baseline.',
    howToUse: 'Route the top anomalies into an APIM throttle guardrail (rate-limit-by-key) for the offending team/subscription during the spike window, and open a review ticket for the workload owner.',
    actionCategory: 'throttle-guardrail'
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
    ],
    plainSummary: 'Projects multi-cloud AI spend 30 and 90 days out with confidence bands so Finance sees overruns against the annual commitment before they happen.',
    algorithm: 'Prophet + AutoARIMA time-series forecasting with weekly/monthly seasonality and onboarding-velocity regressors.',
    topFeatures: [
      { name: 'Daily negotiated-cost trend', impact: 'Highest' },
      { name: 'Team onboarding velocity', impact: 'High' },
      { name: 'Weekly / monthly seasonality', impact: 'Medium' },
      { name: 'Model-mix shift (frontier vs. efficient)', impact: 'Medium' }
    ],
    outputDescription: 'Forecasted daily and period cost with lower/upper 95% confidence bounds and MAPE accuracy per scope.',
    howToUse: 'Compare the projected run-rate to the committed ceiling; when the upper band breaches budget, trigger a capacity or reallocation plan proactively rather than reactively.',
    actionCategory: 'capacity'
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
    details: 'Automated attribution engine joins hashed user sessions, gateway client headers, and business entity trees to attribute 100% of multi-cloud token invoices down to Department, Project, Cost Center, and Environment (Dev/Test/Prod).',
    recommendation: 'Enable automated monthly chargeback PDF generation and tenant subscription billing breakdown for Finance.',
    kpis: [
      { label: 'Active Cost Centers', value: '18' },
      { label: 'Top Consuming Dept', value: 'Engineering ($28.4k)' },
      { label: 'Unassigned Margin', value: '< 0.6%' }
    ],
    plainSummary: 'Attributes every token invoice down to Department, Project, Cost Center, and Environment so no spend is left unallocated and chargeback is defensible.',
    algorithm: 'Deterministic attribution join over hashed sessions and gateway client headers with a hierarchical business-entity rollup.',
    topFeatures: [
      { name: 'Gateway client / subscription id', impact: 'Highest' },
      { name: 'Hashed user \u2192 department mapping', impact: 'High' },
      { name: 'Project / cost-center tags', impact: 'High' },
      { name: 'Environment (Dev/Test/Prod)', impact: 'Medium' }
    ],
    outputDescription: 'Fully attributed cost per entity with an attributed-share percentage and any residual unallocated margin.',
    howToUse: 'Publish monthly chargeback statements per cost center and reallocate shared-platform cost using the observed token-share weights.',
    actionCategory: 'chargeback'
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
    ],
    plainSummary: 'Groups users into behavioural personas by token intensity, tool usage, and prompt depth so model routing and enablement can be tailored per cohort.',
    algorithm: 'K-Means (with silhouette-tuned k) and DBSCAN for outlier personas on standardized behavioural features.',
    topFeatures: [
      { name: 'Tokens per active day', impact: 'Highest' },
      { name: 'Tool-call / agent usage ratio', impact: 'High' },
      { name: 'Average prompt depth', impact: 'Medium' },
      { name: 'Frontier-model share', impact: 'Medium' }
    ],
    outputDescription: 'Each user assigned to a persona cluster with intensity and tool-usage centroids and cohort token share.',
    howToUse: 'Apply persona-based model routing \u2014 e.g. move heavy researchers to large-context efficient models and reserve frontier models for agent builders.',
    actionCategory: 'model-switch'
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
    ],
    plainSummary: 'Scores how much useful business outcome each application gets per token, exposing waste from low cache reuse and bloated tool calls.',
    algorithm: 'Weighted multi-factor composite score (cost-per-task, tokens-per-outcome, cache-hit ratio, tool-call efficiency) with percentile ranking.',
    topFeatures: [
      { name: 'Cache-read hit ratio', impact: 'Highest' },
      { name: 'Tokens per completed task', impact: 'High' },
      { name: 'Tool-call success efficiency', impact: 'Medium' },
      { name: 'Output/input token ratio', impact: 'Medium' }
    ],
    outputDescription: 'Per-application efficiency score (0\u2013100) with the contributing sub-factors and ranking against the enterprise median.',
    howToUse: 'Target the lowest-scoring apps first: enable prompt caching and trim context to lift the score and cut input-token spend.',
    actionCategory: 'prompt-efficiency'
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
    ],
    plainSummary: 'Predicts which projects will blow past their quarterly token allocation, and by how much, while there is still time to act.',
    algorithm: 'Gradient Boosted Trees (XGBoost) classifier/regressor on burn-rate and team-growth features.',
    topFeatures: [
      { name: 'Current burn rate vs. allocation', impact: 'Highest' },
      { name: 'Team expansion velocity', impact: 'High' },
      { name: 'Agent adoption curve', impact: 'Medium' },
      { name: 'Workload seasonality', impact: 'Medium' }
    ],
    outputDescription: 'Per-project overrun probability, projected overage in USD, and the day it is expected to breach.',
    howToUse: 'For high-risk projects, reallocate unused quota from safe projects or drop non-critical workloads to a cheaper model tier before the breach date.',
    actionCategory: 'reallocation'
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
    ],
    plainSummary: 'Finds workloads running on expensive frontier models that a cheaper model can serve at equal quality, and quantifies the savings of switching.',
    algorithm: 'Task classifier over prompt embeddings mapped against a model performance/price benchmark matrix.',
    topFeatures: [
      { name: 'Task type / prompt embedding class', impact: 'Highest' },
      { name: 'Benchmark quality parity score', impact: 'High' },
      { name: 'Current model price per million', impact: 'High' },
      { name: 'Monthly token volume of workload', impact: 'Medium' }
    ],
    outputDescription: 'Per-workload current model, recommended target model, quality-parity score, and estimated annualized savings.',
    howToUse: 'Apply the recommended model map to the routing layer for zero-quality-loss workloads (e.g. summarization \u2192 mini/Nova tier) and bank the savings.',
    actionCategory: 'model-switch'
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
    ],
    plainSummary: 'Ties token cost to real business outcomes (PRs merged, tickets resolved, hours saved) so you fund the agents that pay for themselves and cut the ones that do not.',
    algorithm: 'Cost-to-outcome correlation and ROI ratio modeling per agent / business unit.',
    topFeatures: [
      { name: 'Outcome events per 1K tokens', impact: 'Highest' },
      { name: 'Hours automated per agent', impact: 'High' },
      { name: 'Token cost per outcome', impact: 'High' },
      { name: 'Business-unit value weighting', impact: 'Medium' }
    ],
    outputDescription: 'Per-agent ROI ratio, net monthly value, and the outcome metrics that drove it.',
    howToUse: 'Reallocate budget toward the highest-ROI agents and put low-ROI agents on a cheaper tier or a review list.',
    actionCategory: 'reallocation'
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
    ],
    plainSummary: 'Predicts token-per-minute and request-per-minute exhaustion before the gateway starts returning 429s, and rebalances quota across teams.',
    algorithm: 'Short-horizon TPM/RPM demand forecasting with a capacity-pool constraint solver.',
    topFeatures: [
      { name: 'Peak TPM vs. assigned quota', impact: 'Highest' },
      { name: 'Upcoming release / onboarding calendar', impact: 'High' },
      { name: 'Historical 429 near-miss rate', impact: 'Medium' },
      { name: 'Underutilized quota headroom', impact: 'Medium' }
    ],
    outputDescription: 'Per-team recommended TPM/RPM adjustments, reclaimable headroom, and predicted throttling events avoided.',
    howToUse: 'Apply the recommended rate-limit-by-key / TPM changes in APIM ahead of peak, reclaiming idle quota from over-provisioned teams.',
    actionCategory: 'rate-limit'
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
    ],
    plainSummary: 'Scores prompt hygiene \u2014 bloated system instructions, repeated context, and high retry loops \u2014 and quantifies the tokens you can safely cut.',
    algorithm: 'Prompt feature extraction with repetition/entropy scoring and retry-pattern detection.',
    topFeatures: [
      { name: 'Repeated system-instruction tokens', impact: 'Highest' },
      { name: 'Context window utilization', impact: 'High' },
      { name: 'Retry count per prompt', impact: 'Medium' },
      { name: 'Cacheable repetition ratio', impact: 'Medium' }
    ],
    outputDescription: 'Per-prompt/app bloat percentage, reducible token count, and estimated annual savings from trimming.',
    howToUse: 'Trim and cache the worst-offending pipelines (e.g. RAG system prompts) to reduce input-token spend without changing model or output.',
    actionCategory: 'prompt-efficiency'
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
    details: 'Forecasts enterprise multi-region infrastructure requirements (API gateway throughput, regional model capacity, vector search indices) across 12-month planning horizons.',
    recommendation: 'Provision a secondary API gateway unit in East US by Nov 2026 to accommodate projected 2.4x multi-region growth.',
    kpis: [
      { label: 'Peak API Gateway RPS', value: '420 rps' },
      { label: 'Regional Load Balance', value: 'West US (62%), East US (38%)' },
      { label: 'MACC Spend Attainment', value: '$240k / $230k committed' }
    ],
    plainSummary: 'Forecasts infrastructure needs \u2014 gateway throughput, regional model capacity, vector indices \u2014 across a 12-month horizon so provisioning stays ahead of growth.',
    algorithm: 'Long-horizon capacity forecasting with regional load distribution and commitment-attainment modeling.',
    topFeatures: [
      { name: 'Projected peak gateway RPS', impact: 'Highest' },
      { name: 'Regional traffic distribution', impact: 'High' },
      { name: 'Multi-region growth multiplier', impact: 'Medium' },
      { name: 'MACC commitment burn', impact: 'Medium' }
    ],
    outputDescription: 'Forecasted capacity requirements per region with recommended provisioning dates and commitment-attainment track.',
    howToUse: 'Schedule gateway/model capacity provisioning ahead of the forecasted breach date and steer traffic to keep MACC attainment on track.',
    actionCategory: 'capacity'
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
    ],
    plainSummary: 'Rolls the whole program up into an executive scorecard \u2014 adoption, cost per active employee, negotiated savings, and team rankings \u2014 for board-level FinOps reporting.',
    algorithm: 'Weighted KPI aggregation and index scoring across adoption, efficiency, and savings dimensions.',
    topFeatures: [
      { name: 'Active-user ratio', impact: 'Highest' },
      { name: 'Cost per active employee', impact: 'High' },
      { name: 'Negotiated vs. market savings rate', impact: 'Medium' },
      { name: 'Team adoption ranking', impact: 'Medium' }
    ],
    outputDescription: 'Enterprise adoption index with per-department rankings, cost-per-user, and cumulative savings.',
    howToUse: 'Target enablement where adoption lags and use the scorecard to govern the program and justify continued investment.',
    actionCategory: 'governance'
  }
];

export const MOCK_USER_CLUSTERS: {
  id: number;
  name: string;
  description: string;
  color: string;
  persona: string;
  topTraits: string[];
  recommendation: string;
}[] = [
  {
    id: 0,
    name: 'Autonomous Agent Builders',
    description: 'Multi-turn agent orchestration, tool-heavy workflows, and high context memory across Fab Knowledge, Defect Vision, and MES automated agents.',
    color: '#8b5cf6',
    persona: 'Agent Builders & MLOps Architects',
    topTraits: ['Multi-tool chaining', 'High context memory', 'Complex prompt templates'],
    recommendation: 'Enable prompt caching on Claude 3.7 Sonnet & Kimi Code to reduce input token overhead by 32%.'
  },
  {
    id: 1,
    name: 'High-Velocity Developers',
    description: 'Continuous EDA silicon design, RTL verification, and firmware code generation with high-frequency API invocations.',
    color: '#06b6d4',
    persona: 'EDA & Software Engineers',
    topTraits: ['High request frequency', 'Code synthesis', 'Low per-call latency'],
    recommendation: 'Standardize code assistance on Kimi Code 2.5 and GPT-5 Mini to trim unit cost by 40%.'
  },
  {
    id: 2,
    name: 'Deep Fab & Yield Researchers',
    description: 'Massive context ingestion for wafer map defect analysis, lithography R&D, and process yield anomaly investigations.',
    color: '#10b981',
    persona: 'Yield Data Scientists & Fab Specialists',
    topTraits: ['1M+ context windows', 'Dense document analysis', 'Wafer defect visual embeddings'],
    recommendation: 'Route document ingestion to Google Gemini 2.5 Pro with cached input tiers to save $0.94/M tokens.'
  },
  {
    id: 3,
    name: 'Executive & Strategic Decision Makers',
    description: 'Executive briefings, financial close synthesis, cross-BU supply chain reviews, and high-impact strategic summaries.',
    color: '#f59e0b',
    persona: 'VPs, BU Directors & Finance Leads',
    topTraits: ['Frontier model preference', 'High synthesis ratio', 'Low call frequency'],
    recommendation: 'Deploy GPT Astra with pre-computed executive caching to deliver instant briefings with capped spend.'
  },
  {
    id: 4,
    name: 'Operational & Support Synthesizers',
    description: 'Customer RMA defect triage, fab operations incident resolution, and HR/IT service desk assistance.',
    color: '#3b82f6',
    persona: 'Fab Operations & Customer Quality Engineers',
    topTraits: ['Structured forms', 'Predictable token bursts', 'High SLA availability'],
    recommendation: 'Shift routine RMA lookups to MAI Flash and GPT-4.1-mini for sub-200ms latency at $0.25/M tokens.'
  }
];

export function generateCorporateUsers(): import('./tokenomics.model').UserConsumptionItem[] {
  const FIRST_NAMES = [
    'Sanjay', 'Scott', 'Manish', 'Sumit', 'April', 'Prabu', 'Gary', 'Anand', 'Elena', 'Marcus',
    'Priya', 'David', 'Chen', 'Rachel', 'Hiroshi', 'Carlos', 'Amina', 'Jennifer', 'Alexander', 'Vikram',
    'Mei-Ling', 'Robert', 'Sarah', 'Rajiv', 'Linda', 'Thomas', 'Aisha', 'Daniel', 'Sunita', 'Kevin',
    'Michael', 'Sophia', 'Arun', 'Jessica', 'Wei', 'Brian', 'Fatima', 'Andrew', 'Maria', 'James',
    'Kavita', 'Eric', 'Li', 'Nathan', 'Ananya', 'Christopher', 'Natalie', 'Rajesh', 'Emily', 'Matthew'
  ];

  const LAST_NAMES = [
    'Mehrotra', 'DeBoer', 'Bhatia', 'Sadana', 'Arnzen', 'Raja', 'Dickerson', 'Balaraman', 'Rostova', 'Vance',
    'Sharma', 'Miller', 'Wei', 'Greenwald', 'Tanaka', 'Mendez', 'Al-Mansoor', 'Wu', 'Wright', 'Patel',
    'Zhao', 'Campbell', 'Chen', 'Kapoor', 'Thornton', 'Hughes', 'Al-Sayed', 'Sullivan', 'Joshi', 'Chang',
    'Reynolds', 'Laurent', 'Sengupta', 'Davis', 'Zhang', 'Hayes', 'Farooq', 'Mitchell', 'Santos', 'O\'Connor',
    'Gupta', 'Henderson', 'Liu', 'Cooper', 'Nair', 'Foster', 'Ramirez', 'Verma', 'Brooks', 'Anderson'
  ];

  const BUSINESS_UNITS = [
    'Compute & Networking BU',
    'Mobile BU',
    'Embedded BU',
    'Storage BU',
    'Corporate & Shared Services'
  ];

  const DEPARTMENTS = [
    'Fab Operations',
    'Yield Engineering',
    'Process R&D',
    'Design Engineering',
    'Supply Chain & Planning',
    'Quality & Reliability',
    'Data & AI Platform',
    'IT & Cybersecurity',
    'Finance & FinOps',
    'Sales & Marketing'
  ];

  const TEAMS = [
    'fab-automation', 'yield-analytics', 'defect-classification', 'process-control',
    'eda-design', 'supply-forecast', 'reliability-eng', 'ai-platform-core',
    'mlops', 'data-engineering', 'security-ops', 'finops-governance',
    'customer-quality', 'field-apps', 'corporate-it'
  ];

  const PROJECTS = [
    'yield-copilot', 'predictive-maintenance', 'defect-vision-ai', 'demand-forecasting',
    'wafer-map-analytics', 'eda-assistant', 'supply-chain-optimizer', 'quality-rma-triage',
    'fab-knowledge-agent', 'energy-optimization', 'procurement-copilot', 'hr-service-agent',
    'finance-close-copilot', 'security-soc-analyst', 'exec-briefing-agent'
  ];

  const TITLES_BY_BU: Record<string, string[]> = {
    'Compute & Networking BU': [
      'Senior Director of High-Bandwidth Memory (HBM3e)',
      'Principal DDR5 Silicon Architecture Engineer',
      'Senior Silicon Validation & Emulation Lead',
      'CXL Interconnect Systems Architect',
      'DRAM Memory Core Circuit Designer'
    ],
    'Mobile BU': [
      'Director of Mobile LPDDR5X Architecture',
      'Principal Low-Power DRAM Design Engineer',
      'Mobile SoC Memory Integration Lead',
      'Ultra-Thin Package Stack Technology Engineer'
    ],
    'Embedded BU': [
      'Staff Automotive Memory Systems Engineer',
      'Industrial IoT Edge AI Architect',
      'Aerospace & Defense High-Reliability Flash Engineer',
      'Principal Embedded NOR/NAND Flash Specialist'
    ],
    'Storage BU': [
      'VP of Solid State Storage (SSD) Engineering',
      'Principal NVMe PCIe Gen5 Controller Architect',
      '3D NAND Multi-Tier Cell Flash Memory Engineer',
      'Enterprise QLC SSD Firmware Lead Engineer'
    ],
    'Corporate & Shared Services': [
      'VP of Global Fab Operations & Automation',
      'Chief Enterprise AI & Cloud FinOps Architect',
      'Director of Lithography Yield Analytics & Defect AI',
      'Principal EDA Workflow Automation Specialist',
      'Senior Director of Global Supply Chain Planning'
    ]
  };

  const MODELS = ['claude-3-7-sonnet', 'gpt-5', 'gpt-5-mini', 'gemini-2.5-pro', 'claude-opus-4-1', 'kimi-code', 'mai-flash', 'gpt-astra'];
  const PROVIDERS = ['Anthropic Claude', 'Azure OpenAI', 'Google Vertex', 'AWS Bedrock'];

  // Seeded deterministic 240-user generation
  return Array.from({ length: 240 }, (_, i) => {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length];
    const bu = BUSINESS_UNITS[i % BUSINESS_UNITS.length];
    const dept = DEPARTMENTS[i % DEPARTMENTS.length];
    const titles = TITLES_BY_BU[bu] ?? TITLES_BY_BU['Corporate & Shared Services'];
    const title = titles[i % titles.length];
    const team = TEAMS[i % TEAMS.length];
    const project = PROJECTS[i % PROJECTS.length];

    let cid = 4;
    if (title.includes('Architect') || dept.includes('AI') || title.includes('MLOps')) cid = 0;
    else if (title.includes('Design') || title.includes('Engineer') || title.includes('Validation')) cid = 1;
    else if (dept.includes('Yield') || title.includes('Lithography') || dept.includes('R&D')) cid = 2;
    else if (title.includes('VP') || title.includes('Director') || title.includes('Chief') || dept.includes('Finance')) cid = 3;

    const cluster = MOCK_USER_CLUSTERS[cid];
    const baseMult = (240 - i) * 1.8;
    const totalTokens = Math.round((500000 + (baseMult * 120000)) * (1 + ((i % 7) * 0.15)));
    const inputTokens = Math.round(totalTokens * 0.72);
    const outputTokens = totalTokens - inputTokens;
    const marketCost = Number(((totalTokens / 1000000) * (1.2 + (cid === 3 ? 4.5 : cid === 0 ? 3.0 : 1.5))).toFixed(2));
    const negotiatedCost = Number((marketCost * 0.86).toFixed(2));
    const requestCount = Math.round(180 + (baseMult * 4.2));

    return {
      userIdHash: `usr-hash-${String(i + 1).padStart(5, '0')}`,
      userName: `${fn} ${ln}`,
      userEmail: `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[^a-z]/g, '')}@micron-corp.com`,
      jobTitle: title,
      department: dept,
      businessUnit: bu,
      teamId: team,
      projectId: project,
      costCenter: `CC-SEM-${100 + (i % 15)}`,
      totalTokens,
      inputTokens,
      outputTokens,
      marketCost,
      negotiatedCost,
      requestCount,
      clusterId: cid,
      clusterName: cluster.name,
      primaryModel: MODELS[i % MODELS.length],
      primaryProvider: PROVIDERS[i % PROVIDERS.length]
    };
  }).sort((a, b) => b.marketCost - a.marketCost);
}
