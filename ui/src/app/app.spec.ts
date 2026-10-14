import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { App } from './app';
import { COPILOT_STUDIO_PROVIDER, COPILOT_STUDIO_RATE_CARD, generateCorporateUsers } from './reference-data';
import type { TokenomicsDashboard, TokenomicsRow } from './tokenomics.model';

/** Live-shaped dashboard fixture built from the rows each test provides. */
function dashboardWith(allocations: TokenomicsRow[], trend: TokenomicsRow[] = []): TokenomicsDashboard {
  return {
    generatedAt: new Date().toISOString(),
    windowDays: 30,
    currency: 'USD',
    queryStatus: 'complete',
    actualCost: {
      source: 'AzureCostManagement', queryType: 'ActualCost', status: 'available',
      scope: '/subscriptions/x', currency: 'USD', generatedAt: new Date().toISOString(),
      billedThrough: null, expectedBillingLagHours: 24, scopeCost: null, trackedCost: null,
      dedicatedModelCost: 100, sharedPlatformCost: null, untrackedCost: null,
      allocatedModelCost: 100, allocationMethod: 'observed-token-share',
      byService: [], byResource: [], trend: [],
    },
    summary: {
      requests: 100, successfulRequests: 100, failedRequests: 0, tokenizedRequests: 100,
      tokenCoveragePct: 100, inputTokens: 700, outputTokens: 300, totalTokens: 1000,
      p95LatencyMs: 300, marketCost: 14, negotiatedCost: 12, savings: 2, pricingCoveragePct: 100,
    },
    trend,
    allocations,
    models: [],
    operations: [],
    recentRequests: [],
    dataQuality: { requestTelemetry: 'available', tokenTelemetry: 'available', pricing: 'negotiated', allocation: 'attributed', billing: 'actual' },
  };
}

const foundryRow: TokenomicsRow = {
  ApplicationId: 'foundry-app', Provider: 'Azure AI Foundry', Model: 'gpt-5', TotalTokens: 1000, Requests: 10,
  MarketCost: 4, NegotiatedCost: 3.5, ActualCost: 3.5, ServiceCode: 'azure-ai-foundry', ConsumptionUnit: 'tokens', AiCredits: 0, CreditUnitPriceUsd: 0,
};
const copilotRow: TokenomicsRow = {
  ApplicationId: 'copilot-app', Provider: 'Microsoft Copilot Studio', Model: 'Copilot Studio agent', TotalTokens: 0, Requests: 5,
  MarketCost: 10, NegotiatedCost: 8.8, ActualCost: 8.8, ServiceCode: 'copilot-studio', ConsumptionUnit: 'ai_credits', AiCredits: 1000, CreditUnitPriceUsd: 0.01,
};

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideLocationMocks()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the CostOps brand', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('CostOps');
  });

  it('should render the profile footer links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const footer = fixture.nativeElement.querySelector('.site-footer') as HTMLElement;
    const links = Array.from(footer.querySelectorAll('a'));

    expect(footer.textContent).toContain('Michael Yaacoub');
    expect(footer.textContent).toContain('Sr Solution Engineer');
    expect(links.map(link => link.href)).toEqual([
      'https://github.com/csdmichael/FabricIQ-FoundryIQ-CostOps-Docs',
      'https://www.linkedin.com/in/michael-yaacoub-7a46436/',
    ]);
  });

  it('should filter allocations and models by cloud provider', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    // Seed the dashboard signal with a live-shaped fixture (no mock service data).
    app.dashboard.set({
      generatedAt: new Date().toISOString(),
      windowDays: 30,
      currency: 'USD',
      queryStatus: 'complete',
      actualCost: {
        source: 'AzureCostManagement', queryType: 'ActualCost', status: 'available',
        scope: '/subscriptions/x', currency: 'USD', generatedAt: new Date().toISOString(),
        billedThrough: null, expectedBillingLagHours: 24, scopeCost: null, trackedCost: null,
        dedicatedModelCost: 100, sharedPlatformCost: null, untrackedCost: null,
        allocatedModelCost: 100, allocationMethod: 'observed-token-share',
        byService: [], byResource: [], trend: [],
      },
      summary: {
        requests: 100, successfulRequests: 100, failedRequests: 0, tokenizedRequests: 100,
        tokenCoveragePct: 100, inputTokens: 70, outputTokens: 30, totalTokens: 100,
        p95LatencyMs: 300, marketCost: 12, negotiatedCost: 10, savings: 2, pricingCoveragePct: 100,
      },
      trend: [],
      allocations: [
        { ApplicationId: 'a', Provider: 'AWS Bedrock', Model: 'anthropic.claude-3-7-sonnet', TotalTokens: 500, Requests: 50, MarketCost: 6, NegotiatedCost: 5, ActualCost: 5 },
        { ApplicationId: 'b', Provider: 'GCP Vertex AI', Model: 'gemini-2.5-flash', TotalTokens: 300, Requests: 30, MarketCost: 3, NegotiatedCost: 2.5, ActualCost: 2.5 },
      ],
      models: [
        { Provider: 'AWS Bedrock', Model: 'anthropic.claude-3-7-sonnet', TotalTokens: 500, Requests: 50 },
        { Provider: 'GCP Vertex AI', Model: 'gemini-2.5-flash', TotalTokens: 300, Requests: 30 },
      ],
      operations: [],
      recentRequests: [],
      dataQuality: { requestTelemetry: 'available', tokenTelemetry: 'available', pricing: 'negotiated', allocation: 'attributed', billing: 'actual' },
    });

    expect(app.selectedProvider()).toBe('all');
    expect(app.topAllocations().length).toBeGreaterThan(0);

    app.setProvider('aws');
    expect(app.selectedProvider()).toBe('aws');
    const awsAllocations = app.topAllocations();
    expect(awsAllocations.length).toBeGreaterThan(0);
    expect(awsAllocations.every(a => app.matchesProvider(a.Provider, a.Model, 'aws'))).toBe(true);

    app.setProvider('gcp');
    expect(app.selectedProvider()).toBe('gcp');
    const gcpAllocations = app.topAllocations();
    expect(gcpAllocations.length).toBeGreaterThan(0);
    expect(gcpAllocations.every(a => app.matchesProvider(a.Provider, a.Model, 'gcp'))).toBe(true);

    app.setProvider('all');
    expect(app.selectedProvider()).toBe('all');
  });

  it('offers Azure AI Foundry and Microsoft Copilot Studio as separate provider filters', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const byCode = (code: string) => app.providerOptions.find(option => option.code === code);

    expect(byCode('msft')).toMatchObject({ name: 'Azure AI Foundry', shortName: 'Azure Foundry' });
    expect(byCode('cps')).toMatchObject({ name: 'Microsoft Copilot Studio', shortName: 'Copilot Studio' });
    expect(app.matchesProvider('Azure AI Foundry', 'gpt-5', 'msft')).toBe(true);
    expect(app.matchesProvider('Microsoft Copilot Studio', 'Copilot Studio agent', 'msft')).toBe(false);
    expect(app.matchesProvider('Microsoft Copilot Studio', 'Copilot Studio agent', 'cps')).toBe(true);
    expect(app.matchesProvider('Azure AI Foundry', 'gpt-5', 'cps')).toBe(false);
  });

  it('maps provider labels to tag codes, checking Copilot Studio before the Azure fallback', () => {
    const app = TestBed.createComponent(App).componentInstance;

    expect(app.providerCode('Microsoft Copilot Studio')).toBe('cps');
    expect(app.providerCode('Azure AI Foundry')).toBe('msft');
    expect(app.providerCode('AWS Bedrock')).toBe('aws');
    expect(app.providerCode(undefined)).toBe('msft');
  });

  it('keeps Copilot Studio AI credits out of token volume and converts them to USD', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.dashboard.set(dashboardWith([foundryRow, copilotRow]));

    expect(app.copilotStudio().aiCredits).toBe(1000);
    expect(app.copilotStudio().effectiveListUsdPerCredit).toBeCloseTo(0.01, 6);
    expect(app.copilotStudio().effectiveNegotiatedUsdPerCredit).toBeCloseTo(0.0088, 6);

    app.setProvider('cps');
    expect(app.filteredSummary()?.aiCredits).toBe(1000);
    expect(app.filteredSummary()?.totalTokens).toBe(0);
    expect(app.filteredSummary()?.tokenizedRequests).toBe(0);
    expect(app.topAllocations().map(row => row.Provider)).toEqual(['Microsoft Copilot Studio']);
    expect(app.allocationShare(app.topAllocations()[0])).toBe(100);

    app.setProvider('msft');
    expect(app.filteredSummary()?.totalTokens).toBe(1000);
    expect(app.topAllocations().map(row => row.Provider)).toEqual(['Azure AI Foundry']);
    app.setProvider('all');
  });

  it('guards effective USD per credit against zero credits', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.dashboard.set(dashboardWith([foundryRow]));

    expect(app.copilotStudio().effectiveListUsdPerCredit).toBeNull();
    expect(app.copilotStudio().effectiveNegotiatedUsdPerCredit).toBeNull();
    expect(app.usdPerCredit(app.copilotStudio().effectiveNegotiatedUsdPerCredit)).toBe('—');
  });

  it('scales the trend to Copilot Studio credits from list cost and gives it no token volume', () => {
    const app = TestBed.createComponent(App).componentInstance;
    app.dashboard.set(dashboardWith([foundryRow, copilotRow], [
      { TimeBucket: '2026-10-01', TotalTokens: 1000, MarketCost: 14, NegotiatedCost: 12, ActualCost: 12 },
    ]));

    app.setProvider('cps');
    const [day] = app.filteredTrend();
    expect(day.TotalTokens).toBe(0);
    expect(day.AiCredits).toBe(1000);
    expect(day.MarketCost).toBe(10);
    app.setProvider('all');
  });

  it('mock Copilot Studio users are credit-priced at the list rate with no tokens', () => {
    const users = generateCorporateUsers();
    const copilotUsers = users.filter(user => user.primaryProvider === COPILOT_STUDIO_PROVIDER);

    expect(copilotUsers.length).toBeGreaterThan(0);
    for (const user of copilotUsers) {
      expect(user.totalTokens).toBe(0);
      expect(user.aiCredits).toBeGreaterThan(0);
      expect(user.marketCost).toBeCloseTo((user.aiCredits ?? 0) * COPILOT_STUDIO_RATE_CARD.listUsdPerCredit, 2);
    }
    const providers = new Set(users.map(user => user.primaryProvider));
    expect(providers.has('Azure AI Foundry')).toBe(true);
    expect(providers.has('Azure OpenAI')).toBe(false);
  });

  it('renders the Copilot Studio AI credit rate card in the pricing view', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.error.set('');
    fixture.componentInstance.dashboard.set(dashboardWith([foundryRow, copilotRow]));
    fixture.componentInstance.setView('pricing');
    fixture.componentInstance.setPricingCostModel('ai-credits');
    fixture.detectChanges();
    await fixture.whenStable();

    const card = fixture.nativeElement.querySelector('.cps-rate-card') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('$0.01');
    expect(card.textContent).toContain('$0.0088');
    expect(card.textContent).toContain('$0.008');
    expect(card.textContent).toContain('$200 for 25,000 credits per month');
    expect(card.textContent).toContain('1,000 credits in window');
  });

  it('defaults pricing to token providers and switches AI credits to Copilot Studio', () => {
    const app = TestBed.createComponent(App).componentInstance;

    expect(app.pricingCostModel()).toBe('tokens');
    expect(app.tokenPricingProviderOptions().some(option => option.id === 'cps')).toBe(false);

    app.setPricingCostModel('ai-credits');
    expect(app.selectedProvider()).toBe('cps');

    app.setPricingCostModel('tokens');
    expect(app.selectedProvider()).toBe('all');
  });

  it('groups recommendation notifications and exposes assignments for Michael Yaacoub', () => {
    const app = TestBed.createComponent(App).componentInstance;

    expect(app.recommendationCount()).toBe(8);
    app.setNotificationTab('assigned');
    expect(app.visibleProjectRecommendations().length).toBe(3);
    expect(app.visibleProjectRecommendations().every(group => group.ownerName === 'Michael Yaacoub')).toBe(true);
    expect(app.assignedRecommendationCount()).toBe(7);

    const recommendation = app.visibleProjectRecommendations()[0].recommendations[0];
    app.executeRecommendation(recommendation);
    expect(app.executedRecommendationIds().has(recommendation.id)).toBe(true);
    expect(app.recommendationCount()).toBe(7);
  });
});
