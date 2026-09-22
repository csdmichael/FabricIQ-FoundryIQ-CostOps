import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  alertCircleOutline,
  analyticsOutline,
  barChartOutline,
  calculatorOutline,
  cashOutline,
  chatbubblesOutline,
  checkmarkCircleOutline,
  cloudOutline,
  documentTextOutline,
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
  searchOutline,
  sendOutline,
  serverOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  speedometerOutline,
  trashOutline,
  walletOutline,
  warningOutline,
} from 'ionicons/icons';
import { AuthService } from './auth.service';
import { PromptLibraryService } from './prompt-library.service';
import { TokenomicsChart } from './tokenomics-chart';
import { TokenomicsService } from './tokenomics.service';
import type {
  ChatMessage,
  DashboardView,
  MlUseCaseInfo,
  ModelPriceItem,
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
  imports: [CommonModule, FormsModule, IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner, TokenomicsChart],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
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

  // Fabric Data Agent Chat State
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly chatInput = signal('');
  readonly isChatSending = signal(false);
  readonly showAddPromptModal = signal(false);
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
  ) {
    addIcons({
      addOutline,
      alertCircleOutline,
      analyticsOutline,
      barChartOutline,
      calculatorOutline,
      cashOutline,
      chatbubblesOutline,
      checkmarkCircleOutline,
      cloudOutline,
      documentTextOutline,
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
      searchOutline,
      sendOutline,
      serverOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      speedometerOutline,
      trashOutline,
      walletOutline,
      warningOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    await this.tokenomics.initialize();
    this.pricingCatalog.set(this.tokenomics.getModelPricingCatalog());
    const useCases = this.tokenomics.getMlUseCases();
    this.mlUseCases.set(useCases);
    if (useCases.length > 0) {
      this.selectedMlUseCase.set(useCases[0]);
    }
    this.chatMessages.set(this.tokenomics.getInitialChatMessages());
    await this.refresh();
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

  setView(view: DashboardView): void {
    this.activeView.set(view);
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (frame) {
      frame.scrollTop = 0;
    }
  }

  async toggleAuthentication(): Promise<void> {
    if (this.auth.account()) {
      await this.auth.signOut();
    } else {
      await this.auth.signIn(false);
    }
    await this.refresh();
  }

  selectMlUseCase(useCase: MlUseCaseInfo): void {
    this.selectedMlUseCase.set(useCase);
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
      this.scrollChatToBottom();
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
          content: 'Unable to reach Fabric Data Agent. Returning to cached intelligence.'
        }
      ]);
    } finally {
      this.isChatSending.set(false);
      this.scrollChatToBottom();
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
