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
    await app.ngOnInit();

    expect(app.selectedProvider()).toBe('all');
    expect(app.topAllocations().length).toBeGreaterThan(0);

    // Filter by AWS Bedrock
    app.setProvider('aws');
    expect(app.selectedProvider()).toBe('aws');
    const awsAllocations = app.topAllocations();
    expect(awsAllocations.length).toBeGreaterThan(0);
    expect(awsAllocations.every(a => app.matchesProvider(a.Provider, a.Model, 'aws'))).toBe(true);

    // Filter by GCP Vertex
    app.setProvider('gcp');
    expect(app.selectedProvider()).toBe('gcp');
    const gcpAllocations = app.topAllocations();
    expect(gcpAllocations.length).toBeGreaterThan(0);
    expect(gcpAllocations.every(a => app.matchesProvider(a.Provider, a.Model, 'gcp'))).toBe(true);

    // Reset to All
    app.setProvider('all');
    expect(app.selectedProvider()).toBe('all');
  });
});
