import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { ShowcaseConfigService, ShowcaseVideo } from './showcase-config.service';

type ShowcaseTab = 'videos' | 'value' | 'features' | 'architecture' | 'try-it';
type ValueScenarioId = 'lower' | 'planning' | 'higher';

interface ShowcaseTabItem { id: ShowcaseTab; label: string; icon: string; }
interface FeatureItem { icon: string; title: string; description: string; }
interface SavingsLever { label: string; amount: string; note: string; kind: 'add' | 'subtract'; }
interface ValueScenario {
  id: ValueScenarioId;
  label: string;
  selectorLabel: string;
  description: string;
  monthlySpend: string;
  grossSavingsMonthly: string;
  platformCostMonthly: string;
  netSavingsMonthly: string;
  annualRunRate: string;
  oneTimeSetup: string;
  yearOneNet: string;
  relativeSavings: number;
  levers: SavingsLever[];
  isDefault?: boolean;
}
interface ValueAssumption { label: string; value: string; detail: string; }
interface ArchitectureLayer { title: string; description: string; items: string[]; }

/**
 * Business-value showcase for the Multi-Cloud AI Tokenomics & FinOps platform.
 * Mirrors the structure of the Agentic SDLC showcase: video series,
 * business value with selectable spend scenarios, features, architecture, and a
 * try-it panel. Financial figures follow the auditable planning model in the
 * executive business-case deck (see docs/business-case). They are illustrative
 * planning assumptions — not Micron spend, Microsoft pricing quotes, or guaranteed savings.
 */
@Component({
  selector: 'app-showcase',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './showcase.page.html',
  styleUrl: './showcase.page.scss',
})
export class ShowcasePage implements OnInit {
  readonly activeTab = signal<ShowcaseTab>('videos');
  readonly selectedVideoIndex = signal(0);
  readonly autoplayAll = signal(true);
  readonly audioEnabled = signal(false);
  readonly selectedValueScenarioId = signal<ValueScenarioId>('planning');

  readonly liveUiUrl = 'https://caldova-fabric-costops-ui.azurewebsites.net';
  readonly linkedInUrl = 'https://www.linkedin.com/in/michael-yaacoub-7a46436/';
  readonly githubUrl = 'https://github.com/csdmichael/FabricIQ-FoundryIQ-CostOps';

  private readonly docsRoot = 'https://raw.githubusercontent.com/csdmichael/FabricIQ-FoundryIQ-CostOps-Docs/main/docs';
  readonly docsUrl = 'https://github.com/csdmichael/FabricIQ-FoundryIQ-CostOps-Docs';
  readonly setupGuideUrl = `${this.docsUrl}/blob/main/docs/setup/README.md`;
  readonly userGuideUrl = `${this.docsUrl}/blob/main/docs/user-guide/README.md`;
  readonly guidePdfUrl = '/assets/user-guide/AI-Tokenomics-User-Guide.pdf';
  readonly businessCasePdfUrl = `${this.docsRoot}/business-case/AI%20Tokenomics%20-%20Executive%20Value%20and%20Architecture.pdf`;
  readonly businessCasePptxUrl = `${this.docsRoot}/business-case/AI%20Tokenomics%20-%20Executive%20Value%20and%20Architecture.pptx`;
  readonly businessCaseDocUrl = `${this.docsUrl}/blob/main/docs/business-case/business-case.md`;
  readonly accessRequestUrl =
    'mailto:myaacoub@microsoft.com?subject=Source%20code%20access%20request%20-%20FabricIQ%20FoundryIQ%20CostOps&body=Hello%20Michael%2C%0D%0A%0D%0AI%20would%20like%20to%20request%20source%20code%20access%20to%20the%20Multi-Cloud%20AI%20Tokenomics%20%26%20FinOps%20platform%20(https%3A%2F%2Fgithub.com%2Fcsdmichael%2FFabricIQ-FoundryIQ-CostOps).%0D%0A%0D%0AName%3A%0D%0AOrganization%3A%0D%0AUse%20case%3A%0D%0A';

  readonly tabs: ShowcaseTabItem[] = [
    { id: 'videos', label: 'Video series', icon: 'play-circle-outline' },
    { id: 'value', label: 'Business value', icon: 'trending-up-outline' },
    { id: 'features', label: 'Features', icon: 'sparkles-outline' },
    { id: 'architecture', label: 'Architecture', icon: 'layers-outline' },
    { id: 'try-it', label: 'Try it', icon: 'open-outline' },
  ];

  readonly videos = signal<readonly ShowcaseVideo[]>([]);
  readonly videoLoadError = signal<string | null>(null);
  readonly selectedVideo = computed(() => this.videos()[this.selectedVideoIndex()] ?? null);

  constructor(private readonly showcaseConfig: ShowcaseConfigService = new ShowcaseConfigService()) {}

  ngOnInit(): void {
    void this.loadVideos();
  }

  async loadVideos(): Promise<void> {
    this.videoLoadError.set(null);
    try {
      this.videos.set(await this.showcaseConfig.load());
      this.selectedVideoIndex.set(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown showcase configuration error.';
      this.videoLoadError.set(message);
      console.error('Unable to load showcase video configuration.', error);
    }
  }

  readonly valueScenarios: ValueScenario[] = [
    {
      id: 'lower',
      label: 'Lower spend',
      selectorLabel: '$1M / mo',
      description: 'A smaller in-scope footprint — early adoption or a single business unit piloting governed AI.',
      monthlySpend: '$1.0M',
      grossSavingsMonthly: '$230,880',
      platformCostMonthly: '$50,000',
      netSavingsMonthly: '$180,880',
      annualRunRate: '$2.17M',
      oneTimeSetup: '$300,000',
      yearOneNet: '$1.52M',
      relativeSavings: 8,
      levers: [
        { label: 'Model rightsizing', amount: '+$120,000', note: 'Route routine requests off frontier models.', kind: 'add' },
        { label: 'Prompt / cache efficiency', amount: '+$70,400', note: 'Trim bloated context; exploit cache-read discounts.', kind: 'add' },
        { label: 'Anomaly / waste', amount: '+$40,480', note: 'Catch retry loops, spikes, and idle quota.', kind: 'add' },
        { label: 'Platform operations', amount: '−$50,000', note: 'Fabric capacity, gateway, hosting, and tokens.', kind: 'subtract' },
      ],
    },
    {
      id: 'planning',
      label: 'Planning case',
      selectorLabel: '$5M / mo',
      description: 'The planning baseline: $5M / month of in-scope AI consumption with equal, quality-safe optimization rates.',
      monthlySpend: '$5.0M',
      grossSavingsMonthly: '$1,154,400',
      platformCostMonthly: '$100,000',
      netSavingsMonthly: '$1,054,400',
      annualRunRate: '$12.65M',
      oneTimeSetup: '$600,000',
      yearOneNet: '$10.32M',
      relativeSavings: 49,
      isDefault: true,
      levers: [
        { label: 'Model rightsizing', amount: '+$600,000', note: 'Route routine requests off frontier models.', kind: 'add' },
        { label: 'Prompt / cache efficiency', amount: '+$352,000', note: 'Trim bloated context; exploit cache-read discounts.', kind: 'add' },
        { label: 'Anomaly / waste', amount: '+$202,400', note: 'Catch retry loops, spikes, and idle quota.', kind: 'add' },
        { label: 'Platform operations', amount: '−$100,000', note: 'Fabric capacity, gateway, hosting, and tokens.', kind: 'subtract' },
      ],
    },
    {
      id: 'higher',
      label: 'Higher spend',
      selectorLabel: '$10M / mo',
      description: 'A broad, enterprise-wide rollout with in-scope AI consumption at scale across every business unit.',
      monthlySpend: '$10.0M',
      grossSavingsMonthly: '$2,308,800',
      platformCostMonthly: '$150,000',
      netSavingsMonthly: '$2,158,800',
      annualRunRate: '$25.91M',
      oneTimeSetup: '$900,000',
      yearOneNet: '$21.54M',
      relativeSavings: 100,
      levers: [
        { label: 'Model rightsizing', amount: '+$1,200,000', note: 'Route routine requests off frontier models.', kind: 'add' },
        { label: 'Prompt / cache efficiency', amount: '+$704,000', note: 'Trim bloated context; exploit cache-read discounts.', kind: 'add' },
        { label: 'Anomaly / waste', amount: '+$404,800', note: 'Catch retry loops, spikes, and idle quota.', kind: 'add' },
        { label: 'Platform operations', amount: '−$150,000', note: 'Fabric capacity, gateway, hosting, and tokens.', kind: 'subtract' },
      ],
    },
  ];
  readonly selectedValueScenario = computed(
    () => this.valueScenarios.find(s => s.id === this.selectedValueScenarioId()) ?? this.valueScenarios[1],
  );

  readonly valueAssumptions: ValueAssumption[] = [
    { label: 'In-scope AI consumption', value: '$5M / mo', detail: 'Planning baseline for the default case; benefit scales with spend.' },
    { label: 'Gross opportunity', value: '23.088%', detail: '1 − 0.88 × 0.92 × 0.95 across three non-overlapping levers.' },
    { label: 'Model rightsizing', value: '12%', detail: 'Route routine requests off frontier models; preserve quality and latency.' },
    { label: 'Prompt & cache efficiency', value: '8%', detail: 'Trim bloated context and exploit prompt cache-read discounts.' },
    { label: 'Anomaly & waste', value: '5%', detail: 'Catch retry loops, spikes, and idle reserved quota.' },
    { label: 'Platform run cost', value: '$100K / mo', detail: 'Fabric capacity, APIM gateway, hosting, and model tokens (default case).' },
  ];

  readonly features: FeatureItem[] = [
    { icon: 'cloud-outline', title: 'Five-cloud ingestion', description: 'Normalized token telemetry from AWS Bedrock, GCP Vertex AI, Azure OpenAI, OpenAI Direct, and Anthropic Claude.' },
    { icon: 'pricetag-outline', title: 'Time-series rate cards', description: 'SHA-256-provenanced market and negotiated pricing with effective-dated joins across every provider.' },
    { icon: 'server-outline', title: 'Governed Fabric lakehouse', description: 'Token consumption and ML output tables with a governed tokenomics usage-fact star schema.' },
    { icon: 'sparkles-outline', title: '12 PySpark ML models', description: 'Anomaly detection, cost forecasting, chargeback, budget overrun, quota, prompt quality, and agent ROI.' },
    { icon: 'bar-chart-outline', title: 'Interactive DirectQuery reports', description: 'Executive and ML dashboards built directly on the governed lakehouse — no data copy.' },
    { icon: 'chatbubbles-outline', title: 'Tokenomics Foundry Agent', description: 'A conversational Microsoft Foundry Agent answers FinOps questions live from the governed tokenomics lakehouse.' },
    { icon: 'people-outline', title: 'Attribution & chargeback', description: 'Every token attributed to business unit, department, team, project, cost center, and application.' },
    { icon: 'shield-checkmark-outline', title: 'Governed security', description: 'Delegated on-behalf-of identity, private networking, and policy enforced across every layer.' },
    { icon: 'options-outline', title: 'Config-driven deployment', description: 'A single configuration file drives data, APIs, agent, reports, and UI — no hard-coded values.' },
  ];

  readonly architectureLayers: ArchitectureLayer[] = [
    { title: 'Token & Pricing Ingestion', description: 'Multi-cloud token telemetry, Microsoft usage logs, and real-time pricing.', items: ['Azure API Management + Foundry (Microsoft)', 'AWS Bedrock, GCP Vertex AI, Anthropic Claude, OpenAI, Meta Llama', 'Azure / AWS / Google pricing APIs via Azure Function'] },
    { title: 'Fabric Ingestion', description: 'Dataflow Gen2 unifies every source into one ingestion layer.', items: ['Microsoft token consumption (Log Analytics)', 'Other-provider token consumption (Blob / S3 / Cloud Storage)', 'Normalized multi-cloud pricing data'] },
    { title: 'Governed Lakehouse (Medallion Architecture)', description: 'Bronze / Silver / Gold tiers on OneLake with an optional data agent.', items: ['Bronze — raw token consumption + pricing', 'Silver — merged, enriched, ML outputs added', 'Gold — semantic model & Power BI-ready tables', 'Fabric Data Agent (optionally with Fabric Ontology)'] },
    { title: 'Experience & Governance', description: 'Secure, responsive control plane and AI assistants.', items: ['Microsoft Foundry AI assistant', 'Angular / Ionic CostOps chat UI', 'Power BI dashboards & reports', 'Secure API gateway + identity'] },
  ];

  setTab(tab: ShowcaseTab): void { this.activeTab.set(tab); }
  selectVideo(index: number): void { this.selectedVideoIndex.set(index); }
  enableAudio(video: HTMLVideoElement): void {
    video.muted = false;
    video.volume = 1;
    this.audioEnabled.set(true);
  }
  playNextVideo(): void {
    if (!this.autoplayAll()) return;
    const nextIndex = this.selectedVideoIndex() + 1;
    if (nextIndex < this.videos().length) this.selectedVideoIndex.set(nextIndex);
  }
  selectValueScenario(id: ValueScenarioId): void { this.selectedValueScenarioId.set(id); }
}
