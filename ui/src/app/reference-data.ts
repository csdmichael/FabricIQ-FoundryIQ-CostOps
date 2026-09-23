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
