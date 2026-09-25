import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  arrowForward,
  constructOutline,
  mailOutline,
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
  logoGithub,
  personCircleOutline,
  trendingUpOutline,
  layersOutline,
  playCircleOutline,
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
import { ChatExportService } from './chat-export';
import { ChatHistoryService } from './chat-history.service';
import { PowerBiEmbed } from './powerbi-embed';
import { PromptLibraryService } from './prompt-library.service';
import { ResultBlock } from './result-block';
import { ResultChart } from './result-chart';
import { ShowcasePage } from './showcase.page';
import { TokenomicsChart } from './tokenomics-chart';
import { TokenomicsService } from './tokenomics.service';
import type {
  ChatMessage,
  DashboardView,
  MlUseCaseInfo,
  ModelPriceItem,
  PowerBiEmbedArtifact,
  PowerBiEmbedConfig,
  SavedPrompt,
  TokenomicsRow,
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
  { id: 'msft', name: 'Azure OpenAI', shortName: 'Azure', code: 'msft' },
  { id: 'oai', name: 'OpenAI Direct', shortName: 'OpenAI', code: 'oai' },
  { id: 'cld', name: 'Anthropic Claude', shortName: 'Claude', code: 'cld' },
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
  private readonly validViews: DashboardView[] = ['overview', 'allocation', 'pricing', 'powerbi', 'ml-insights', 'data-agent', 'showcase'];
  readonly dashboard = signal<Awaited<ReturnType<TokenomicsService['dashboard']>> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly windowDays = signal<WindowDays>(30);
  readonly activeView = signal<DashboardView>('overview');

  // Multi-Cloud Provider Filter State
  readonly providerOptions = PROVIDER_OPTIONS;
  readonly selectedProvider = signal<string>('all');
  readonly allocationSearch = signal<string>('');

  // Multi-Cloud Pricing State
  readonly pricingCatalog = signal<ModelPriceItem[]>([]);
  readonly pricingSearch = signal('');
  readonly pricingProviderFilter = signal<string>('all');
  readonly calculatorInputTokens = signal(10); // Millions of input tokens
  readonly calculatorOutputTokens = signal(5);  // Millions of output tokens

  // ML Insights State
  readonly mlUseCases = signal<MlUseCaseInfo[]>([]);
  readonly selectedMlUseCase = signal<MlUseCaseInfo | null>(null);
  readonly mlFilterProvider = signal<string>('all');

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

  // Fabric Data Agent Chat State
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
        return p.includes('azure') || p.includes('foundry') || p.includes('msft') || (p.includes('openai') && !p.includes('direct') && !p.includes('oai'));
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

    const p95Latency = filter === 'gcp' ? 260 : filter === 'aws' ? 290 : filter === 'msft' ? 310 : filter === 'cld' ? 340 : 380;

    return {
      requests,
      successfulRequests,
      failedRequests,
      tokenizedRequests: requests,
      tokenCoveragePct: 100,
      inputTokens: Math.round(totalTokens * 0.72),
      outputTokens: Math.round(totalTokens * 0.28),
      totalTokens,
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

    const allAllocations = data.allocations;
    const allTokens = allAllocations.reduce((acc, r) => acc + (r.TotalTokens ?? 0), 0) || 1;
    const providerTokens = (data.allocations.filter(r => this.matchesProvider(r.Provider, r.Model, filter)))
      .reduce((acc, r) => acc + (r.TotalTokens ?? 0), 0);
    const ratio = providerTokens / allTokens;

    return fullTrend.map(row => ({
      ...row,
      TotalTokens: Math.round((row.TotalTokens ?? 0) * ratio),
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
      const key = [row.ApplicationId, row.ProjectId, row.TeamId, row.CostCenter].join('|');
      const current = grouped.get(key);
      grouped.set(key, current ? {
        ...current,
        Requests: (current.Requests ?? 0) + (row.Requests ?? 0),
        TotalTokens: (current.TotalTokens ?? 0) + (row.TotalTokens ?? 0),
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
      return matchesSearch && matchesProvider;
    });
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
      constructOutline,
      mailOutline,
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
      logoGithub,
      personCircleOutline,
      trendingUpOutline,
      layersOutline,
      playCircleOutline,
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
      return;
    }

    await this.tokenomics.initialize();
    const useCases = this.tokenomics.getMlUseCases();
    this.mlUseCases.set(useCases);
    if (useCases.length > 0) {
      this.selectedMlUseCase.set(useCases[0]);
    }
    // Load sample prompts, pricing, and chat welcome from the live API.
    const [prompts, pricing] = await Promise.all([
      this.tokenomics.getSamplePrompts(),
      this.tokenomics.getModelPricingCatalog(),
    ]);
    this.promptLibrary.setServerPrompts(prompts);
    this.pricingCatalog.set(pricing);
    this.chatMessages.set(this.tokenomics.getInitialChatMessages());
    await this.refresh();
    await this.loadPowerBi();
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

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.dashboard.set(await this.tokenomics.dashboard(this.windowDays()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The dashboard is temporarily unavailable.');
    } finally {
      this.loading.set(false);
    }
  }

  async selectWindow(value: unknown): Promise<void> {
    const days = Number(value) as WindowDays;
    if (![1, 7, 30, 90].includes(days)) return;
    this.windowDays.set(days);
    await this.refresh();
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

  /** Export a Data Agent response to Excel / PowerPoint / Word. */
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

  // Fabric Data Agent Chat Methods
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
    } catch {
      this.chatMessages.update(msgs => [
        ...msgs,
        {
          id: `err-${Date.now()}`,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: 'Unable to complete Data Agent query at this moment. Please check network connectivity.'
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
    } catch {
      this.chatMessages.update(msgs => [
        ...msgs,
        {
          id: `err-${Date.now()}`,
          sender: 'agent',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: 'Unable to reach the Data Agent right now. Please try again.'
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
    const total = this.filteredSummary()?.totalTokens || this.dashboard()?.summary.totalTokens || 0;
    return total ? ((row.TotalTokens ?? 0) / total) * 100 : 0;
  }

  operationSuccess(row: TokenomicsRow): number {
    return !row.Requests ? 0 : ((row.Successes ?? 0) / row.Requests) * 100;
  }
}
