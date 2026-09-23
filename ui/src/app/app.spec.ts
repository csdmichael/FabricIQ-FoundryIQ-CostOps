import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
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
      'https://github.com/csdmichael/FabricIQ-FoundryIQ-CostOps',
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
});
