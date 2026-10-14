import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowForward,
  bulbOutline,
  swapHorizontalOutline,
  helpCircleOutline,
  gitBranchOutline,
  constructOutline,
  mailOutline,
  notificationsOutline,
  optionsOutline,
  alertCircleOutline,
  analyticsOutline,
  barChartOutline,
  calculatorOutline,
  cashOutline,
  chatbubblesOutline,
  checkmarkCircleOutline,
  cloudOutline,
  documentTextOutline,
  downloadOutline,
  documentOutline,
  easelOutline,
  pieChartOutline,
  ellipseOutline,
  flashOutline,
  folderOpenOutline,
  gridOutline,
  informationCircleOutline,
  logInOutline,
  logOutOutline,
  openOutline,
  peopleOutline,
  pricetagOutline,
  pulseOutline,
  refreshOutline,
  rocketOutline,
  arrowDownOutline,
  arrowBackOutline,
  trophyOutline,
  logoGithub,
  personCircleOutline,
  trendingUpOutline,
  layersOutline,
  playCircleOutline,
  volumeHighOutline,
  searchOutline,
  sendOutline,
  serverOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  speedometerOutline,
  timeOutline,
  closeOutline,
  createOutline,
  trashOutline,
  walletOutline,
  warningOutline,
} from 'ionicons/icons';
import { AuthService } from './auth.service';
import { asApiError, type ApiErrorInfo } from './api-error';
import { ChatExportService } from './chat-export';
import { ChatHistoryService } from './chat-history.service';
import { PowerBiEmbed } from './powerbi-embed';
import { PromptLibraryService } from './prompt-library.service';
import { COPILOT_STUDIO_RATE_CARD } from './reference-data';
import { ResultBlock } from './result-block';
import { ResultChart } from './result-chart';
import { ShowcasePage } from './showcase.page';
import { TokenomicsChart } from './tokenomics-chart';
import { TokenomicsService } from './tokenomics.service';
import type {
  ActionCategory,
  ActionPlan,
  ActionRecommendationsResponse,
  ChatMessage,
  DashboardView,
  MlUseCaseInfo,
  ModelPriceItem,
  PowerBiEmbedArtifact,
  PowerBiEmbedConfig,
  SavedPrompt,
  ShowcaseVisitsReport,
  TokenomicsRow,
  UserClusterSummary,
  UserConsumptionItem,
  UserConsumptionResponse,
  UserSegmentationResponse,
  WindowDays
} from './tokenomics.model';

export interface ProviderFilterOption {
  id: string;
  name: string;
  shortName: string;
  code: string;
}

export const PROVIDER_OPTIONS: ProviderFilterOption[] = [
  { id: 'all', name: 'All Clouds (5)', shortName: 'All', code: 'all' },
  { id: 'aws', name: 'AWS Bedrock', shortName: 'AWS', code: 'aws' },
  { id: 'gcp', name: 'GCP Vertex AI', shortName: 'GCP', code: 'gcp' },
  { id: 'msft', name: 'Azure AI Foundry', shortName: 'Azure Foundry', code: 'msft' },
  { id: 'cps', name: 'Microsoft Copilot Studio', shortName: 'Copilot Studio', code: 'cps' },
  { id: 'oai', name: 'OpenAI Direct', shortName: 'OpenAI', code: 'oai' },
  { id: 'cld', name: 'Anthropic Claude', shortName: 'Claude', code: 'cld' },
];

interface RecommendationNotification {
  id: string;
  title: string;
  category: ActionCategory;
  mockAction: string;
}

interface ProjectRecommendationGroup {
  projectId: string;
  projectName: string;
  ownerName: string;
  ownerEmail: string;
  recommendations: RecommendationNotification[];
}

const CURRENT_USER_EMAIL = 'admin@Caldova37587778.onmicrosoft.com';
const PROJECT_RECOMMENDATIONS: ProjectRecommendationGroup[] = [
  {
    projectId: 'PRJ-CUSTOMER-360',
    projectName: 'Customer 360 Copilot',
    ownerName: 'Michael Yaacoub',
    ownerEmail: CURRENT_USER_EMAIL,
    recommendations: [
      { id: 'customer-360-token-limit', title: 'High token growth detected on customer-summary APIs', category: 'rate-limit', mockAction: 'Update token limit in APIM' },
      { id: 'customer-360-model-switch', title: 'GPT-5 workload can use a lower-cost model tier', category: 'model-switch', mockAction: 'Switch model in Foundry' },
      { id: 'customer-360-budget', title: 'Monthly inference budget is projected to exceed target', category: 'throttle-guardrail', mockAction: 'Apply budget guardrail' },
    ],
  },
  {
    projectId: 'PRJ-SERVICE-DESK',
    projectName: 'Service Desk Agent',
    ownerName: 'Michael Yaacoub',
    ownerEmail: CURRENT_USER_EMAIL,
    recommendations: [
      { id: 'service-desk-quota', title: 'Peak-hour quota is undersized for agent demand', category: 'quota-increase', mockAction: 'Increase Foundry quota' },
      { id: 'service-desk-prompt', title: 'Prompt context contains repeated grounding instructions', category: 'prompt-efficiency', mockAction: 'Optimize prompt in Foundry' },
    ],
  },
  {
    projectId: 'PRJ-SUPPLY-CHAIN',
    projectName: 'Supply Chain Forecasting',
    ownerName: 'Michael Yaacoub',
    ownerEmail: CURRENT_USER_EMAIL,
    recommendations: [
      { id: 'supply-chain-reallocate', title: 'Unused quota can be reassigned to forecast batch jobs', category: 'reallocation', mockAction: 'Reallocate model quota' },
      { id: 'supply-chain-cache', title: 'Repeated forecast context is eligible for prompt caching', category: 'prompt-efficiency', mockAction: 'Enable prompt caching' },
    ],
  },
  {
    projectId: 'PRJ-LEGAL-REVIEW',
    projectName: 'Legal Document Review',
    ownerName: 'Avery Johnson',
    ownerEmail: 'avery.johnson@Caldova37587778.onmicrosoft.com',
    recommendations: [
      { id: 'legal-governance', title: 'Model deployment requires an updated governance approval', category: 'governance', mockAction: 'Open governance review' },
    ],
  },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner, TokenomicsChart, PowerBiEmbed, ShowcasePage, ResultChart, ResultBlock],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private readonly location = inject(Location);
  private readonly validViews: DashboardView[] = ['overview', 'allocation', 'pricing', 'powerbi', 'ml-insights', 'user-consumption', 'user-segmentation', 'actions', 'ml-guide', 'data-agent', 'showcase', 'showcase-visits'];
  readonly dashboard = signal<Awaited<ReturnType<TokenomicsService['dashboard']>> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly errorInfo = signal<ApiErrorInfo | null>(null);
  readonly windowDays = signal<WindowDays>(30);
  readonly activeView = signal<DashboardView>('overview');

  // Business Units & Departments
  readonly businessUnitOptions = [
    { id: 'all', label: 'All Business Units (5)' },
    { id: 'Compute & Networking BU', label: 'Compute & Networking BU' },
    { id: 'Mobile BU', label: 'Mobile BU' },
    { id: 'Embedded BU', label: 'Embedded BU' },
    { id: 'Storage BU', label: 'Storage BU' },
    { id: 'Corporate & Shared Services', label: 'Corporate & Shared Services' },
  ];

  readonly departmentOptions = [
    { id: 'all', label: 'All Departments' },
    { id: 'Fab Operations', label: 'Fab Operations' },
    { id: 'Yield Engineering', label: 'Yield Engineering' },
    { id: 'Process R&D', label: 'Process R&D' },
    { id: 'Design Engineering', label: 'Design Engineering' },
    { id: 'Supply Chain & Planning', label: 'Supply Chain & Planning' },
    { id: 'Quality & Reliability', label: 'Quality & Reliability' },
    { id: 'Data & AI Platform', label: 'Data & AI Platform' },
    { id: 'IT & Cybersecurity', label: 'IT & Cybersecurity' },
    { id: 'Finance & FinOps', label: 'Finance & FinOps' },
    { id: 'Sales & Marketing', label: 'Sales & Marketing' },
  ];

  // User Consumption State
  readonly userConsumption = signal<UserConsumptionResponse | null>(null);
  readonly userConsumptionLoading = signal(false);
  readonly userSearch = signal('');
  readonly selectedUserBu = signal('all');
  readonly selectedUserDept = signal('all');
  readonly selectedUserSort = signal<'cost' | 'tokens' | 'requests' | 'name'>('cost');
  readonly userPage = signal(1);
  readonly userPageSize = signal(20);

  // User Segmentation & Cluster State
  readonly userSegmentation = signal<UserSegmentationResponse | null>(null);
  readonly userSegmentationLoading = signal(false);
  readonly selectedCluster = signal<UserClusterSummary | null>(null);
  readonly drillThroughSort = signal<'cost' | 'tokens'>('cost');
  readonly drillThroughSearch = signal('');
  readonly drillThroughPage = signal(1);
  readonly drillThroughPageSize = signal(10);

  // Multi-Cloud Provider Filter State
  readonly providerOptions = PROVIDER_OPTIONS;
  readonly copilotRateCard = COPILOT_STUDIO_RATE_CARD;
  readonly selectedProvider = signal<string>('all');
  readonly allocationSearch = signal<string>('');

  // Multi-Cloud Pricing State
  readonly pricingCatalog = signal<ModelPriceItem[]>([]);
  readonly pricingSearch = signal('');
  readonly pricingProviderFilter = signal<string>('all');
  readonly pricingCostModel = signal<'tokens' | 'ai-credits'>('tokens');
  readonly calculatorInputTokens = signal(10); // Millions of input tokens
  readonly calculatorOutputTokens = signal(5);  // Millions of output tokens

  // ML Insights State
  readonly mlUseCases = signal<MlUseCaseInfo[]>([]);
  readonly selectedMlUseCase = signal<MlUseCaseInfo | null>(null);
  readonly mlFilterProvider = signal<string>('all');

  // Action Center State (closed feedback loop)
  readonly actions = signal<ActionRecommendationsResponse | null>(null);
  readonly actionsLoading = signal(false);
  readonly actionsError = signal('');
  readonly actionsErrorInfo = signal<ApiErrorInfo | null>(null);
  readonly actionCategoryFilter = signal<ActionCategory | 'all'>('all');

  // Header recommendation notifications
  readonly notificationsOpen = signal(false);
  readonly notificationTab = signal<'all' | 'assigned'>('all');
  readonly selectedNotificationProject = signal<ProjectRecommendationGroup | null>(null);
  readonly executedRecommendationIds = signal<ReadonlySet<string>>(new Set());
  readonly recommendationFeedback = signal('');
  readonly projectRecommendations = PROJECT_RECOMMENDATIONS;
  readonly visibleProjectRecommendations = computed(() => {
    const groups = this.notificationTab() === 'assigned'
      ? this.projectRecommendations.filter(group => group.ownerEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase())
      : this.projectRecommendations;
    return groups.filter(group => group.recommendations.some(item => !this.executedRecommendationIds().has(item.id)));
  });
  readonly recommendationCount = computed(() => this.projectRecommendations.reduce(
    (count, group) => count + group.recommendations.filter(item => !this.executedRecommendationIds().has(item.id)).length,
    0
  ));
  readonly assignedRecommendationCount = computed(() => this.projectRecommendations
    .filter(group => group.ownerEmail.toLowerCase() === CURRENT_USER_EMAIL.toLowerCase())
    .reduce((count, group) => count + group.recommendations.filter(item => !this.executedRecommendationIds().has(item.id)).length, 0));

  readonly showcaseVisits = signal<ShowcaseVisitsReport | null>(null);
  readonly showcaseVisitsLoading = signal(false);
  readonly showcaseVisitsError = signal('');
  readonly showcaseVisitLocations = computed(
    () => new Set(
      (this.showcaseVisits()?.visits ?? [])
        .map(visit => visit.countryCode || visit.location)
        .filter(location => location && location !== 'Unknown')
    ).size
  );

  readonly filteredActionPlans = computed<ActionPlan[]>(() => {
    const data = this.actions();
    if (!data) return [];
    const filter = this.actionCategoryFilter();
    return filter === 'all' ? data.plans : data.plans.filter(p => p.category === filter);
  });

  // ML Guide state (expandable algorithm documentation)
  readonly expandedGuideKey = signal<string | null>(null);

  // Power BI Embedded Viewer State
  readonly selectedPowerBiTab = signal<'consumption' | 'ml-insights' | 'dashboard'>('consumption');
  readonly selectedPowerBiProvider = signal<string>('all');
  readonly selectedPowerBiDept = signal<string>('all');
  readonly powerBiEmbed = signal<PowerBiEmbedConfig | null>(null);
  readonly powerBiToken = signal<string | null>(null);

  readonly currentPowerBiArtifact = computed<PowerBiEmbedArtifact | null>(() => {
    const config = this.powerBiEmbed();
    if (!config) return null;
    const tab = this.selectedPowerBiTab();
    if (tab === 'consumption') return config.reports.find(r => r.key === 'consumption') ?? null;
    if (tab === 'ml-insights') return config.reports.find(r => r.key === 'ml-insights') ?? null;
    return config.dashboards.find(d => d.key === 'executive') ?? config.dashboards[0] ?? null;
  });

  /**
   * Proper Power BI *web* URL for opening a report/dashboard in a new tab.
   * The embedUrl (app.powerbi.com/reportEmbed?…) is for iframe embedding only and
   * does not render on its own, so external links must use the groups/… form.
   */
  readonly currentPowerBiWebUrl = computed<string>(() => {
    const config = this.powerBiEmbed();
    const artifact = this.currentPowerBiArtifact();
    if (!config || !artifact) return 'https://app.powerbi.com';
    const segment = artifact.kind === 'dashboard' ? 'dashboards' : 'reports';
    return `https://app.powerbi.com/groups/${config.workspaceId}/${segment}/${artifact.id}`;
  });

  // Foundry Agent Chat State
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly chatInput = signal('');
  readonly isChatSending = signal(false);
  private currentConversationId = `conv-${Date.now()}`;
  readonly showHistory = signal(false);
  /** True once the user has sent at least one message (moves input to bottom). */
  readonly chatStarted = computed(() => this.chatMessages().some(m => m.sender === 'user'));
  readonly showAddPromptModal = signal(false);
  readonly showPromptPicker = signal(false);
  readonly promptSearch = signal('');
  readonly newPromptTitle = signal('');
  readonly newPromptCategory = signal<SavedPrompt['category']>('Executive & FinOps');
  readonly newPromptText = signal('');
  readonly newPromptDescription = signal('');

  readonly lastUpdated = computed(() => {
    const value = this.dashboard()?.generatedAt;
    return value ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
  });

  readonly activeProviderName = computed(() => {
    const opt = this.providerOptions.find(p => p.id === this.selectedProvider());
    return opt?.name ?? 'All Clouds (5)';
  });

  /** Copilot Studio rows are AI-credit billed and carry no token telemetry. */
  isCopilotStudioRow(row: Pick<TokenomicsRow, 'ServiceCode' | 'Provider'>): boolean {
    return row.ServiceCode === 'copilot-studio' || (row.Provider ?? '').toLowerCase().includes('copilot');
  }

  /** Maps an API provider label to its filter/CSS code. Copilot Studio is checked before the Azure fallback. */
  providerCode(provider: string | null | undefined): string {
    const p = (provider ?? '').toLowerCase();
    if (p.includes('copilot')) return 'cps';
    if (p.includes('aws')) return 'aws';
    if (p.includes('gcp')) return 'gcp';
    if (p.includes('anthropic')) return 'cld';
    if (p.includes('direct')) return 'oai';
    return 'msft';
  }

  /** Copilot Studio totals from ledger rows. Effective rates are null when no credits were consumed. */
  readonly copilotStudio = computed(() => {
    const rows = (this.dashboard()?.allocations ?? []).filter(row => this.isCopilotStudioRow(row));
    const aiCredits = rows.reduce((sum, row) => sum + (row.AiCredits ?? 0), 0);
    const marketCost = rows.reduce((sum, row) => sum + (row.MarketCost ?? 0), 0);
    const negotiatedCost = rows.reduce((sum, row) => sum + (row.NegotiatedCost ?? 0), 0);
    return {
      aiCredits,
      marketCost,
      negotiatedCost,
      effectiveListUsdPerCredit: aiCredits > 0 ? marketCost / aiCredits : null,
      effectiveNegotiatedUsdPerCredit: aiCredits > 0 ? negotiatedCost / aiCredits : null,
    };
  });

  usdPerCredit(value: number | null): string {
    return value === null ? '—' : this.money(value, 4);
  }

  matchesProvider(providerString?: string, modelString?: string, targetFilter?: string): boolean {
    const filter = targetFilter ?? this.selectedProvider();
    if (!filter || filter === 'all') return true;
    const p = (providerString || '').toLowerCase();
    const m = (modelString || '').toLowerCase();

    switch (filter) {
      case 'aws':
        return p.includes('aws') || p.includes('bedrock') || m.includes('amazon') || m.includes('nova');
      case 'gcp':
        return p.includes('gcp') || p.includes('vertex') || m.includes('gemini');
      case 'msft':
      case 'azure':
        return !p.includes('copilot') && (p.includes('azure') || p.includes('foundry') || p.includes('msft') || (p.includes('openai') && !p.includes('direct') && !p.includes('oai')));
      case 'cps':
        return p.includes('copilot');
      case 'oai':
      case 'openai':
        return (p.includes('direct') || p.includes('oai') || p.includes('openai direct')) || (p.includes('openai') && !p.includes('azure'));
      case 'cld':
      case 'claude':
      case 'anthropic':
        return (p.includes('anthropic') || p.includes('claude') || p.includes('cld')) && !p.includes('bedrock');
      default:
        return p.includes(filter.toLowerCase()) || m.includes(filter.toLowerCase());
    }
  }

  readonly filteredAllocations = computed(() => {
    const filter = this.selectedProvider();
    const search = this.allocationSearch().toLowerCase().trim();
    const rows = this.dashboard()?.allocations ?? [];

    return rows.filter(row => {
      const matchesP = this.matchesProvider(row.Provider, row.Model, filter);
      const matchesS = !search ||
        (row.ApplicationId || '').toLowerCase().includes(search) ||
        (row.Department || '').toLowerCase().includes(search) ||
        (row.TeamId || '').toLowerCase().includes(search) ||
        (row.CostCenter || '').toLowerCase().includes(search) ||
        (row.ProjectId || '').toLowerCase().includes(search) ||
        (row.Model || '').toLowerCase().includes(search) ||
        (row.Provider || '').toLowerCase().includes(search);
      return matchesP && matchesS;
    });
  });

  readonly filteredModels = computed(() => {
    const filter = this.selectedProvider();
    const models = this.dashboard()?.models ?? [];
    if (filter === 'all') return models;
    return models.filter(m => this.matchesProvider(m.Provider, m.Model, filter));
  });

  readonly filteredSummary = computed(() => {
    const data = this.dashboard();
    if (!data) return null;
    const filter = this.selectedProvider();
    if (filter === 'all') {
      return {
        ...data.summary,
        aiCredits: this.copilotStudio().aiCredits,
        dedicatedModelCost: data.actualCost.dedicatedModelCost,
        scopeCost: data.actualCost.scopeCost,
        activeModelsCount: data.models.length,
        providerCount: 5,
        billedThrough: data.actualCost.billedThrough,
      };
    }

    const allocations = this.dashboard()?.allocations.filter(r => this.matchesProvider(r.Provider, r.Model, filter)) ?? [];
    const models = this.filteredModels();
    const totalTokens = allocations.reduce((sum, r) => sum + (r.TotalTokens ?? 0), 0);
    const requests = allocations.reduce((sum, r) => sum + (r.Requests ?? 0), 0);
    const successfulRequests = Math.round(requests * 0.994);
    const failedRequests = requests - successfulRequests;
    const marketCost = Number(allocations.reduce((sum, r) => sum + (r.MarketCost ?? 0), 0).toFixed(2));
    const negotiatedCost = Number(allocations.reduce((sum, r) => sum + (r.NegotiatedCost ?? 0), 0).toFixed(2));
    const dedicatedModelCost = Number(allocations.reduce((sum, r) => sum + (r.ActualCost ?? r.NegotiatedCost ?? 0), 0).toFixed(2));
    const savings = Number((marketCost - negotiatedCost).toFixed(2));
    const aiCredits = allocations.reduce((sum, r) => sum + (r.AiCredits ?? 0), 0);
    const isCopilot = filter === 'cps';

    const p95Latency = filter === 'gcp' ? 260 : filter === 'aws' ? 290 : filter === 'msft' ? 310 : filter === 'cps' ? 350 : filter === 'cld' ? 340 : 380;

    return {
      requests,
      successfulRequests,
      failedRequests,
      tokenizedRequests: isCopilot ? 0 : requests,
      tokenCoveragePct: isCopilot ? 0 : 100,
      inputTokens: Math.round(totalTokens * 0.72),
      outputTokens: Math.round(totalTokens * 0.28),
      totalTokens,
      aiCredits,
      p95LatencyMs: p95Latency,
      marketCost,
      negotiatedCost,
      savings,
      pricingCoveragePct: 100,
      dedicatedModelCost,
      scopeCost: Number((dedicatedModelCost * 1.25).toFixed(2)),
      activeModelsCount: models.length,
      providerCount: 1,
      billedThrough: data.actualCost.billedThrough,
    };
  });

  readonly filteredTrend = computed(() => {
    const data = this.dashboard();
    if (!data) return [];
    const filter = this.selectedProvider();
    const fullTrend = data.trend;
    if (filter === 'all') return fullTrend;

    // Copilot Studio has no token telemetry, so its share is measured in list USD and shown as AI credits.
    const isCopilot = filter === 'cps';
    const basis = (r: TokenomicsRow): number => (isCopilot ? (r.MarketCost ?? 0) : (r.TotalTokens ?? 0));
    const totalBasis = data.allocations.reduce((acc, r) => acc + basis(r), 0) || 1;
    const providerBasis = data.allocations
      .filter(r => this.matchesProvider(r.Provider, r.Model, filter))
      .reduce((acc, r) => acc + basis(r), 0);
    const ratio = providerBasis / totalBasis;

    return fullTrend.map(row => ({
      ...row,
      TotalTokens: isCopilot ? 0 : Math.round((row.TotalTokens ?? 0) * ratio),
      AiCredits: isCopilot ? Math.round(((row.MarketCost ?? 0) * ratio) / COPILOT_STUDIO_RATE_CARD.listUsdPerCredit) : 0,
      MarketCost: Number(((row.MarketCost ?? 0) * ratio).toFixed(2)),
      NegotiatedCost: Number(((row.NegotiatedCost ?? 0) * ratio).toFixed(2)),
      ActualCost: Number(((row.ActualCost ?? 0) * ratio).toFixed(2)),
      Requests: Math.round((row.Requests ?? 0) * ratio),
      Successes: Math.round((row.Successes ?? 0) * ratio),
      Errors: Math.round((row.Errors ?? 0) * ratio),
    }));
  });

  readonly successRate = computed(() => {
    const summary = this.filteredSummary();
    return !summary?.requests ? 0 : (summary.successfulRequests / summary.requests) * 100;
  });

  readonly costPerTokenizedRequest = computed(() => {
    const summary = this.filteredSummary();
    const cost = summary?.dedicatedModelCost ?? summary?.negotiatedCost;
    return !summary?.tokenizedRequests || cost === null || cost === undefined ? null : cost / summary.tokenizedRequests;
  });

  readonly topAllocations = computed(() => {
    const grouped = new Map<string, TokenomicsRow>();
    const addNullable = (left: number | null | undefined, right: number | null | undefined): number | null => (
      left === null || left === undefined
        ? right ?? null
        : right === null || right === undefined ? left : left + right
    );
    for (const row of this.filteredAllocations()) {
      // Copilot Studio credit lines stay separate from token lines so each row shows a single volume unit.
      const key = [row.ApplicationId, row.ProjectId, row.TeamId, row.CostCenter, this.isCopilotStudioRow(row) ? 'cps' : 'tokens'].join('|');
      const current = grouped.get(key);
      grouped.set(key, current ? {
        ...current,
        Requests: (current.Requests ?? 0) + (row.Requests ?? 0),
        TotalTokens: (current.TotalTokens ?? 0) + (row.TotalTokens ?? 0),
        AiCredits: (current.AiCredits ?? 0) + (row.AiCredits ?? 0),
        MarketCost: addNullable(current.MarketCost, row.MarketCost),
        NegotiatedCost: addNullable(current.NegotiatedCost, row.NegotiatedCost),
        ActualCost: addNullable(current.ActualCost, row.ActualCost),
        Model: current.Model || row.Model,
        Provider: current.Provider || row.Provider,
      } : { ...row });
    }
    return [...grouped.values()].sort((left, right) => (
      (right.ActualCost ?? right.NegotiatedCost ?? right.TotalTokens ?? 0)
      - (left.ActualCost ?? left.NegotiatedCost ?? left.TotalTokens ?? 0)
    ));
  });

  readonly filteredPricing = computed(() => {
    const search = this.pricingSearch().toLowerCase().trim();
    const provider = this.pricingProviderFilter();
    return this.pricingCatalog().filter(item => {
      const matchesSearch = !search ||
        item.modelName.toLowerCase().includes(search) ||
        item.modelFamily.toLowerCase().includes(search) ||
        item.providerName.toLowerCase().includes(search);
      const matchesProvider = provider === 'all' || item.provider === provider;
      return item.provider !== 'cps' && matchesSearch && matchesProvider;
    });
  });

  readonly tokenPricingProviderOptions = computed(() => this.providerOptions.filter(option => option.id !== 'cps'));

  readonly topConsumers = computed<UserConsumptionItem[]>(() => {
    return (this.userConsumption()?.users ?? []).slice(0, 5);
  });

  readonly clusterCircles = computed(() => {
    const data = this.userSegmentation();
    if (!data || !data.clusters.length) return [];
    const maxUsers = Math.max(...data.clusters.map(c => c.userCount), 1);
    const totalUsers = data.totalUsers || 1;
    return data.clusters.map(c => {
      const scale = c.userCount / maxUsers;
      const sizePx = Math.round(150 + scale * 75);
      const percent = Math.round((c.userCount / totalUsers) * 100);
      return {
        ...c,
        sizePx,
        percent,
      };
    });
  });

  readonly drillThroughFilteredUsers = computed<UserConsumptionItem[]>(() => {
    const cluster = this.selectedCluster();
    if (!cluster) return [];
    let users = [...cluster.topUsers];
    const search = this.drillThroughSearch().toLowerCase().trim();
    if (search) {
      users = users.filter(u =>
        u.userName.toLowerCase().includes(search) ||
        u.userEmail.toLowerCase().includes(search) ||
        u.jobTitle.toLowerCase().includes(search) ||
        u.teamId.toLowerCase().includes(search) ||
        u.businessUnit.toLowerCase().includes(search) ||
        u.projectId.toLowerCase().includes(search)
      );
    }
    const sort = this.drillThroughSort();
    if (sort === 'tokens') {
      users.sort((a, b) => b.totalTokens - a.totalTokens);
    } else {
      users.sort((a, b) => b.marketCost - a.marketCost);
    }
    return users;
  });

  readonly drillThroughPaginatedUsers = computed<UserConsumptionItem[]>(() => {
    const users = this.drillThroughFilteredUsers();
    const page = this.drillThroughPage();
    const pageSize = this.drillThroughPageSize();
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  });

  readonly drillThroughTotalPages = computed<number>(() => {
    const total = this.drillThroughFilteredUsers().length;
    return Math.max(1, Math.ceil(total / this.drillThroughPageSize()));
  });

  constructor(
    readonly tokenomics: TokenomicsService,
    readonly auth: AuthService,
    readonly promptLibrary: PromptLibraryService,
    readonly chatExport: ChatExportService,
    readonly chatHistory: ChatHistoryService,
  ) {
    addIcons({
      addOutline,
      arrowForward,
      bulbOutline,
      swapHorizontalOutline,
      helpCircleOutline,
      gitBranchOutline,
      constructOutline,
      mailOutline,
      notificationsOutline,
      optionsOutline,
      alertCircleOutline,
      analyticsOutline,
      barChartOutline,
      calculatorOutline,
      cashOutline,
      chatbubblesOutline,
      checkmarkCircleOutline,
      cloudOutline,
      documentTextOutline,
      downloadOutline,
      documentOutline,
      easelOutline,
      pieChartOutline,
      ellipseOutline,
      flashOutline,
      folderOpenOutline,
      gridOutline,
      informationCircleOutline,
      logInOutline,
      logOutOutline,
      openOutline,
      peopleOutline,
      pricetagOutline,
      pulseOutline,
      refreshOutline,
      rocketOutline,
      arrowDownOutline,
      arrowBackOutline,
      trophyOutline,
      logoGithub,
      personCircleOutline,
      trendingUpOutline,
      layersOutline,
      playCircleOutline,
      volumeHighOutline,
      searchOutline,
      sendOutline,
      serverOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      speedometerOutline,
      timeOutline,
      closeOutline,
      createOutline,
      trashOutline,
      walletOutline,
      warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    // Initialize the active view from the URL and keep them in sync (deep-linkable,
    // browser back/forward supported).
    this.applyViewFromUrl();
    this.location.onUrlChange(() => this.applyViewFromUrl());

    // The showcase is a standalone, unauthenticated marketing page — it does not
    // need the dashboard telemetry, pricing, prompts, or Power BI to be loaded.
    if (this.activeView() === 'showcase') {
      this.loading.set(false);
      void this.tokenomics.recordShowcaseVisit();
      return;
    }

    await this.tokenomics.initialize();
    const useCases = this.tokenomics.getMlUseCases();
    this.mlUseCases.set(useCases);
    if (useCases.length > 0) {
      this.selectedMlUseCase.set(useCases[0]);
    }
    // Load sample prompts, pricing, and chat welcome from the live API.
    await Promise.all([
      this.loadPrompts(),
      this.loadPricing(),
      this.loadUserConsumption(),
      this.loadUserSegmentation(),
    ]);
    this.chatMessages.set(this.tokenomics.getInitialChatMessages());
    await this.refresh();
    await this.loadActions();
    await this.loadPowerBi();
    if (this.activeView() === 'showcase-visits') {
      await this.loadShowcaseVisits();
    }
  }

  /** Load the Power BI embed configuration and acquire a Power BI access token. */
  async loadPowerBi(): Promise<void> {
    const [config, token] = await Promise.all([
      this.tokenomics.getPowerBiEmbedConfig(),
      this.auth.powerBiToken(),
    ]);
    this.powerBiEmbed.set(config);
    this.powerBiToken.set(token);
  }

  async loadPricing(): Promise<void> {
    this.pricingCatalog.set(await this.tokenomics.getModelPricingCatalog());
  }

  async loadPrompts(): Promise<void> {
    this.promptLibrary.setServerPrompts(await this.tokenomics.getSamplePrompts());
  }

  async loadUserConsumption(): Promise<void> {
    this.userConsumptionLoading.set(true);
    try {
      const data = await this.tokenomics.getUserConsumption(
        this.windowDays(),
        this.userSearch(),
        this.selectedUserBu(),
        this.selectedUserDept(),
        undefined,
        this.selectedUserSort(),
        this.userPage(),
        this.userPageSize()
      );
      this.userConsumption.set(data);
    } catch (e) {
      console.error('Failed to load user consumption', e);
    } finally {
      this.userConsumptionLoading.set(false);
    }
  }

  async loadUserSegmentation(): Promise<void> {
    this.userSegmentationLoading.set(true);
    try {
      const data = await this.tokenomics.getUserSegmentation(this.windowDays());
      this.userSegmentation.set(data);
      if (!this.selectedCluster() && data.clusters.length > 0) {
        this.selectedCluster.set(data.clusters[0]);
      }
    } catch (e) {
      console.error('Failed to load user segmentation', e);
    } finally {
      this.userSegmentationLoading.set(false);
    }
  }

  selectCluster(cluster: UserClusterSummary): void {
    this.selectedCluster.set(cluster);
    this.drillThroughPage.set(1);
  }

  setUserPage(page: number): void {
    this.userPage.set(page);
    void this.loadUserConsumption();
  }

  setUserSort(sort: 'cost' | 'tokens' | 'requests' | 'name'): void {
    this.selectedUserSort.set(sort);
    this.userPage.set(1);
    void this.loadUserConsumption();
  }

  setUserBuFilter(bu: string): void {
    this.selectedUserBu.set(bu);
    this.userPage.set(1);
    void this.loadUserConsumption();
  }

  setUserDeptFilter(dept: string): void {
    this.selectedUserDept.set(dept);
    this.userPage.set(1);
    void this.loadUserConsumption();
  }

  onUserSearchInput(search: string): void {
    this.userSearch.set(search);
    this.userPage.set(1);
    void this.loadUserConsumption();
  }

  setDrillThroughPage(page: number): void {
    this.drillThroughPage.set(page);
  }

  setDrillThroughSort(sort: 'cost' | 'tokens'): void {
    this.drillThroughSort.set(sort);
    this.drillThroughPage.set(1);
  }

  onDrillThroughSearch(search: string): void {
    this.drillThroughSearch.set(search);
    this.drillThroughPage.set(1);
  }

  async refresh(): Promise<void> {
    if (this.activeView() === 'showcase-visits') {
      await this.loadShowcaseVisits();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.errorInfo.set(null);
    try {
      this.dashboard.set(await this.tokenomics.dashboard(this.windowDays()));
      void this.loadUserConsumption();
      void this.loadUserSegmentation();
    } catch (error) {
      const info = asApiError(error).info;
      this.error.set(info.title);
      this.errorInfo.set(info);
    } finally {
      this.loading.set(false);
    }
  }

  async selectWindow(value: unknown): Promise<void> {
    const days = Number(value) as WindowDays;
    if (![1, 7, 30, 90].includes(days)) return;
    this.windowDays.set(days);
    await this.refresh();
    await this.loadActions();
    if (this.activeView() === 'showcase-visits') {
      await this.loadShowcaseVisits();
    }
  }

  async loadShowcaseVisits(): Promise<void> {
    this.showcaseVisitsLoading.set(true);
    this.showcaseVisitsError.set('');
    try {
      this.showcaseVisits.set(await this.tokenomics.getShowcaseVisits(this.windowDays()));
    } catch (error) {
      this.showcaseVisits.set(null);
      this.showcaseVisitsError.set(asApiError(error).info.title);
    } finally {
      this.showcaseVisitsLoading.set(false);
    }
  }

  /** Load data-driven FinOps action recommendations for the current window. */
  async loadActions(): Promise<void> {
    this.actionsLoading.set(true);
    this.actionsError.set('');
    this.actionsErrorInfo.set(null);
    try {
      this.actions.set(await this.tokenomics.getActionRecommendations(this.windowDays()));
    } catch (error) {
      this.actions.set(null);
      const info = asApiError(error).info;
      this.actionsError.set(info.title);
      this.actionsErrorInfo.set(info);
    } finally {
      this.actionsLoading.set(false);
    }
  }

  setActionCategoryFilter(category: ActionCategory | 'all'): void {
    this.actionCategoryFilter.set(category);
  }

  toggleNotifications(): void {
    this.notificationsOpen.update(open => !open);
    this.selectedNotificationProject.set(null);
    this.recommendationFeedback.set('');
  }

  closeNotifications(): void {
    this.notificationsOpen.set(false);
    this.selectedNotificationProject.set(null);
    this.recommendationFeedback.set('');
  }

  setNotificationTab(tab: 'all' | 'assigned'): void {
    this.notificationTab.set(tab);
    this.selectedNotificationProject.set(null);
    this.recommendationFeedback.set('');
  }

  selectNotificationProject(group: ProjectRecommendationGroup): void {
    this.selectedNotificationProject.set(group);
    this.recommendationFeedback.set('');
  }

  executeRecommendation(recommendation: RecommendationNotification): void {
    this.executedRecommendationIds.update(ids => new Set([...ids, recommendation.id]));
    this.recommendationFeedback.set(`${recommendation.mockAction} started successfully.`);
  }

  openRecommendationInActionCenter(recommendation: RecommendationNotification): void {
    this.setActionCategoryFilter(recommendation.category);
    this.closeNotifications();
    this.setView('actions');
  }

  private readonly actionCategoryLabels: Record<string, string> = {
    'model-switch': 'Model Switching',
    'rate-limit': 'Token & Rate Limits',
    'reallocation': 'Quota Reallocation',
    'throttle-guardrail': 'Throttle Guardrails',
    'prompt-efficiency': 'Prompt Efficiency',
    'chargeback': 'Chargeback',
    'capacity': 'Capacity',
    'quota-increase': 'Quota Increase',
    'governance': 'Governance',
  };

  private readonly actionCategoryIcons: Record<string, string> = {
    'model-switch': 'swap-horizontal-outline',
    'rate-limit': 'speedometer-outline',
    'reallocation': 'git-branch-outline',
    'throttle-guardrail': 'shield-checkmark-outline',
    'prompt-efficiency': 'flash-outline',
    'chargeback': 'wallet-outline',
    'capacity': 'server-outline',
    'quota-increase': 'trending-up-outline',
    'governance': 'shield-checkmark-outline',
  };

  categoryLabel(category: string): string {
    return this.actionCategoryLabels[category] ?? category;
  }

  categoryIcon(category: string): string {
    return this.actionCategoryIcons[category] ?? 'bulb-outline';
  }

  toggleGuide(key: string): void {
    this.expandedGuideKey.set(this.expandedGuideKey() === key ? null : key);
  }

  /** Export the current recommendation set as a downloadable JSON action plan. */
  exportActionPlan(): void {
    const data = this.actions();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finops-action-plan-${this.windowDays()}d.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private applyViewFromUrl(): void {
    const path = this.location.path().split('?')[0].replace(/^\/+|\/+$/g, '') as DashboardView;
    const next = this.validViews.includes(path) ? path : 'overview';
    if (this.activeView() !== next) {
      this.activeView.set(next);
    }
  }

  setView(view: DashboardView): void {
    this.activeView.set(view);
    // Reflect the current page in the URL so it is deep-linkable and shareable.
    if (this.location.path().split('?')[0].replace(/^\/+|\/+$/g, '') !== view) {
      this.location.go('/' + view);
    }
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (frame) {
      frame.scrollTop = 0;
    }
    if (view === 'user-consumption') {
      void this.loadUserConsumption();
    }
    if (view === 'user-segmentation') {
      void this.loadUserSegmentation();
    }
    if (view === 'showcase-visits') {
      void this.loadShowcaseVisits();
    }
    if (view === 'powerbi') {
      void this.loadPowerBi();
    }
    if (view === 'pricing') {
      void this.loadPricing();
    }
    if (view === 'data-agent') {
      void this.loadPrompts();
    }
  }

  async toggleAuthentication(): Promise<void> {
    if (this.auth.account()) {
      await this.auth.signOut();
      await this.refresh();
      await this.loadPowerBi();
    } else {
      // Redirect is more reliable than popup (no popup blockers / timeouts); the
      // app re-initializes and restores the signed-in account on return.
      await this.auth.signIn(true);
    }
  }

  selectMlUseCase(useCase: MlUseCaseInfo): void {
    this.selectedMlUseCase.set(useCase);
  }

  /** Saved prompts filtered by the picker search box. */
  pickerPrompts(): SavedPrompt[] {
    const search = this.promptSearch().toLowerCase().trim();
    const all = this.promptLibrary.prompts();
    if (!search) return all;
    return all.filter(p =>
      p.title.toLowerCase().includes(search) ||
      p.category.toLowerCase().includes(search) ||
      (p.description || '').toLowerCase().includes(search)
    );
  }

  /** Put a saved prompt into the input so the user can tweak it before sending. */
  pickPrompt(prompt: SavedPrompt): void {
    this.showPromptPicker.set(false);
    this.promptSearch.set('');
    this.chatInput.set(prompt.prompt);
    // Focus the textarea so the user can edit immediately.
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.chat-text-input');
      if (el) {
        el.focus();
        el.selectionStart = el.selectionEnd = el.value.length;
      }
    }, 0);
  }

  /** Enter sends the message; Shift+Enter inserts a new line. */
  onChatEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return; // allow newline
    }
    keyboardEvent.preventDefault();
    void this.sendCustomChatMessage();
  }

  /** Export a Foundry Agent response to Excel / PowerPoint / Word. */
  readonly exporting = signal<string>('');
  async exportMessage(message: ChatMessage, format: 'excel' | 'ppt' | 'word'): Promise<void> {
    this.exporting.set(`${message.id}:${format}`);
    try {
      if (format === 'excel') await this.chatExport.toExcel(message);
      else if (format === 'ppt') await this.chatExport.toPowerPoint(message);
      else await this.chatExport.toWord(message);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      this.exporting.set('');
    }
  }

  setProvider(providerId: string): void {
    this.selectedProvider.set(providerId);
    this.pricingProviderFilter.set(providerId);
    this.selectedPowerBiProvider.set(providerId);
    this.mlFilterProvider.set(providerId);
  }

  setPricingProviderFilter(provider: string): void {
    this.pricingProviderFilter.set(provider);
    this.selectedProvider.set(provider);
  }

  setPricingCostModel(model: 'tokens' | 'ai-credits'): void {
    this.pricingCostModel.set(model);
    this.pricingSearch.set('');
    if (model === 'ai-credits') {
      this.setProvider('cps');
    } else {
      this.setProvider('all');
    }
  }

  setPowerBiProvider(provider: string): void {
    this.selectedPowerBiProvider.set(provider);
    this.selectedProvider.set(provider);
  }

  setPowerBiTab(tab: 'consumption' | 'ml-insights' | 'dashboard'): void {
    this.selectedPowerBiTab.set(tab);
  }

  calculateModelCost(item: ModelPriceItem): { market: number; negotiated: number; savings: number } {
    const inM = this.calculatorInputTokens();
    const outM = this.calculatorOutputTokens();
    const market = inM * item.inputPerMillion + outM * item.outputPerMillion;
    const negotiated = market * (1 - item.discountPercent / 100);
    const savings = market - negotiated;
    return {
      market: Number(market.toFixed(2)),
      negotiated: Number(negotiated.toFixed(2)),
      savings: Number(savings.toFixed(2))
    };
  }

  // Foundry Agent Chat Methods
  private persistConversation(): void {
    this.chatHistory.save(this.currentConversationId, this.chatMessages(), this.tokenomics.getChatThreadId());
  }

  /** Start a fresh conversation (Copilot "New chat"). Saves the current one first. */
  startNewChat(): void {
    this.persistConversation();
    this.currentConversationId = `conv-${Date.now()}`;
    this.tokenomics.resetChatThread();
    this.chatInput.set('');
    this.showHistory.set(false);
    this.chatMessages.set(this.tokenomics.getInitialChatMessages());
    this.focusChatInput();
  }

  /** Open a saved conversation from history. */
  openConversation(id: string): void {
    // Persist any in-progress conversation before switching.
    this.persistConversation();
    const convo = this.chatHistory.get(id);
    if (!convo) return;
    this.currentConversationId = convo.id;
    this.tokenomics.setChatThreadId(convo.threadId);
    this.chatMessages.set(convo.messages);
    this.showHistory.set(false);
    this.scrollChatToBottom();
  }

  deleteConversation(id: string, event: Event): void {
    event.stopPropagation();
    this.chatHistory.remove(id);
    if (id === this.currentConversationId) {
      this.startNewChat();
    }
  }

  private focusChatInput(): void {
    setTimeout(() => {
      const el = document.querySelector<HTMLTextAreaElement>('.chat-text-input');
      if (el) el.focus();
    }, 60);
  }

  currentConversationIdValue(): string {
    return this.currentConversationId;
  }

  formatHistoryDate(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async runSavedPrompt(prompt: SavedPrompt): Promise<void> {
    this.chatMessages.update(msgs => [
      ...msgs,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: prompt.prompt
      }
    ]);
    this.isChatSending.set(true);

    try {
      const response = await this.tokenomics.askDataAgent(prompt.prompt, prompt);
      this.chatMessages.update(msgs => [...msgs, response]);
    } catch (error) {
      console.error('Foundry Agent query failed', error);
      this.chatMessages.update(msgs => [
        ...msgs,
        {
          id: `err-${Date.now()}`,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: 'Unable to complete Foundry Agent query at this moment. Please check network connectivity.'
        }
      ]);
    } finally {
      this.isChatSending.set(false);
      this.persistConversation();
      this.scrollChatToBottom();
      this.focusChatInput();
    }
  }

  async sendCustomChatMessage(): Promise<void> {
    const text = this.chatInput().trim();
    if (!text || this.isChatSending()) return;

    this.chatInput.set('');
    this.chatMessages.update(msgs => [
      ...msgs,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: text
      }
    ]);
    this.isChatSending.set(true);

    try {
      const response = await this.tokenomics.askDataAgent(text);
      this.chatMessages.update(msgs => [...msgs, response]);
    } catch (error) {
      console.error('Foundry Agent query failed', error);
      this.chatMessages.update(msgs => [
        ...msgs,
        {
          id: `err-${Date.now()}`,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: 'Unable to reach the Foundry Agent right now. Please try again.'
        }
      ]);
    } finally {
      this.isChatSending.set(false);
      this.persistConversation();
      this.scrollChatToBottom();
      this.focusChatInput();
    }
  }

  openAddPromptModal(): void {
    this.newPromptTitle.set('');
    this.newPromptCategory.set('Executive & FinOps');
    this.newPromptText.set('');
    this.newPromptDescription.set('');
    this.showAddPromptModal.set(true);
  }

  closeAddPromptModal(): void {
    this.showAddPromptModal.set(false);
  }

  saveCustomPrompt(): void {
    const title = this.newPromptTitle().trim();
    const prompt = this.newPromptText().trim();
    if (!title || !prompt) return;

    this.promptLibrary.addPrompt({
      title,
      category: this.newPromptCategory(),
      prompt,
      description: this.newPromptDescription().trim() || 'Custom saved user prompt.',
      targetTables: ['ml.tokenomics_usage_fact'],
      suggestedDimensions: ['source_code', 'model_family']
    });

    this.closeAddPromptModal();
  }

  deletePrompt(id: string, event: Event): void {
    event.stopPropagation();
    this.promptLibrary.removePrompt(id);
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = document.querySelector('.chat-thread');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  compact(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  integer(value: number | undefined): string {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value ?? 0);
  }

  percent(value: number): string {
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)}%`;
  }

  money(value: number | null | undefined, maximumFractionDigits = 0): string {
    if (value === null || value === undefined) return '$0.00';
    return new Intl.NumberFormat('en', { style: 'currency', currency: this.dashboard()?.currency ?? 'USD', maximumFractionDigits }).format(value);
  }

  allocationShare(row: TokenomicsRow): number {
    if (this.isCopilotStudioRow(row)) {
      const credits = this.copilotStudio().aiCredits;
      return credits ? ((row.AiCredits ?? 0) / credits) * 100 : 0;
    }
    const total = this.filteredSummary()?.totalTokens || this.dashboard()?.summary.totalTokens || 0;
    return total ? ((row.TotalTokens ?? 0) / total) * 100 : 0;
  }

  operationSuccess(row: TokenomicsRow): number {
    return !row.Requests ? 0 : ((row.Successes ?? 0) / row.Requests) * 100;
  }
}
