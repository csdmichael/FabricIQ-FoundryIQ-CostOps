import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';

type ShowcaseTab = 'videos' | 'value' | 'features' | 'architecture' | 'try-it';
type ValueModeId = 'observability' | 'optimization' | 'autonomous';

interface ShowcaseTabItem { id: ShowcaseTab; label: string; icon: string; }
interface VideoItem { sequence: string; title: string; description: string; duration: string; }
interface FeatureItem { icon: string; title: string; description: string; }
interface ValueMode {
  id: ValueModeId;
  label: string;
  description: string;
  annualSavings: string;
  savingsPerModel: string;
  wasteEliminated: string;
  forecastAccuracy: string;
  yearOneRoi: string;
  payback: string;
  relativeSavings: number;
  isDefault?: boolean;
}
interface ValueAssumption { label: string; value: string; detail: string; }
interface ArchitectureLayer { title: string; description: string; items: string[]; }

/**
 * Business-value showcase for the Multi-Cloud AI Tokenomics & FinOps platform.
 * Mirrors the structure of the Agentic SDLC showcase: video series (placeholders),
 * business value with selectable governance modes, features, architecture, and a
 * try-it panel. All figures model a Micron-scale semiconductor enterprise.
 */
@Component({
  selector: 'app-showcase',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './showcase.page.html',
  styleUrl: './showcase.page.scss',
})
export class ShowcasePage {
  readonly activeTab = signal<ShowcaseTab>('videos');
  readonly selectedVideoIndex = signal(0);
  readonly selectedValueModeId = signal<ValueModeId>('optimization');

  readonly liveUiUrl = 'https://caldova-fabric-costops-ui.azurewebsites.net';
  readonly linkedInUrl = 'https://www.linkedin.com/in/michael-yaacoub-7a46436/';
  readonly githubUrl = 'https://github.com/csdmichael/FabricIQ-FoundryIQ-CostOps';

  readonly tabs: ShowcaseTabItem[] = [
    { id: 'videos', label: 'Video series', icon: 'play-circle-outline' },
    { id: 'value', label: 'Business value', icon: 'trending-up-outline' },
    { id: 'features', label: 'Features', icon: 'sparkles-outline' },
    { id: 'architecture', label: 'Architecture', icon: 'layers-outline' },
    { id: 'try-it', label: 'Try it', icon: 'open-outline' },
  ];

  readonly videos: VideoItem[] = [
    { sequence: '01', title: 'Platform Overview', description: 'Multi-cloud AI tokenomics, the Fabric medallion lakehouse, and the FinOps control plane in five minutes.', duration: '05:12' },
    { sequence: '02', title: 'Live Dashboard Walkthrough', description: 'Command center, cost attribution, model rate cards, and provider filtering on live Fabric data.', duration: '08:40' },
    { sequence: '03', title: '12 PySpark ML Insights', description: 'Anomaly detection, budget overrun prediction, model optimization, and quota management outputs.', duration: '07:15' },
    { sequence: '04', title: 'Tokenomics Data Agent', description: 'Ask natural-language FinOps questions answered live by the Foundry agent via the Fabric Data Agent.', duration: '06:28' },
    { sequence: '05', title: 'Power BI DirectQuery', description: 'Executive dashboards and reports built directly on the OneLake tokenomics tables.', duration: '04:50' },
    { sequence: '06', title: 'Architecture & Governance', description: 'APIM boundary, OBO identity, private networking, and the config-driven deployment pipeline.', duration: '09:05' },
  ];
  readonly selectedVideo = computed(() => this.videos[this.selectedVideoIndex()]);

  readonly valueModes: ValueMode[] = [
    {
      id: 'observability',
      label: 'Observability',
      description: 'Unified multi-cloud visibility: every token, model, and dollar attributed to a team, project, and cost center.',
      annualSavings: '$14.8M',
      savingsPerModel: '$412K',
      wasteEliminated: '18%',
      forecastAccuracy: '88%',
      yearOneRoi: '6.4x',
      payback: '1.9 months',
      relativeSavings: 52,
    },
    {
      id: 'optimization',
      label: 'Active Optimization',
      description: 'The default enterprise balance: ML-driven model routing, prompt-caching, and budget guardrails act on the insights.',
      annualSavings: '$27.6M',
      savingsPerModel: '$768K',
      wasteEliminated: '31%',
      forecastAccuracy: '93%',
      yearOneRoi: '11.3x',
      payback: '1.1 months',
      relativeSavings: 78,
      isDefault: true,
    },
    {
      id: 'autonomous',
      label: 'Autonomous FinOps',
      description: 'Policy enforces quota, model downgrades, and anomaly throttling automatically once every guardrail passes.',
      annualSavings: '$41.2M',
      savingsPerModel: '$1.14M',
      wasteEliminated: '44%',
      forecastAccuracy: '96%',
      yearOneRoi: '16.8x',
      payback: '0.8 months',
      relativeSavings: 100,
    },
  ];
  readonly selectedValueMode = computed(
    () => this.valueModes.find(m => m.id === this.selectedValueModeId()) ?? this.valueModes[1],
  );

  readonly valueAssumptions: ValueAssumption[] = [
    { label: 'Enterprise scale', value: '48,000 FTE', detail: 'Semiconductor design, fab operations, and shared services.' },
    { label: 'Annual AI spend', value: '$89M', detail: 'Across AWS Bedrock, GCP Vertex, Azure OpenAI, OpenAI, and Anthropic.' },
    { label: 'Governed tokens', value: '281B / mo', detail: '15K+ workloads across 5 clouds and 14 model families.' },
    { label: 'Addressable waste', value: '30–45%', detail: 'Prompt bloat, over-provisioned frontier models, and idle quota.' },
    { label: 'Platform run cost', value: '$1.9M / year', detail: 'Fabric capacity, APIM, App Service, and model tokens.' },
    { label: 'Year-1 investment', value: '$6.4M', detail: 'Build, connectors, ML models, enablement, and platform run.' },
  ];

  readonly features: FeatureItem[] = [
    { icon: 'cloud-outline', title: 'Five-cloud ingestion', description: 'Normalized token telemetry from AWS Bedrock, GCP Vertex AI, Azure OpenAI, OpenAI Direct, and Anthropic Claude.' },
    { icon: 'pricetag-outline', title: 'Time-series rate cards', description: 'SHA-256-provenanced market and negotiated pricing with effective-dated joins across every provider.' },
    { icon: 'server-outline', title: 'Fabric medallion lakehouse', description: 'Bronze/Silver/Gold Delta tables in OneLake with a governed ml.tokenomics_usage_fact star schema.' },
    { icon: 'sparkles-outline', title: '12 PySpark ML models', description: 'Anomaly detection, cost forecasting, chargeback, budget overrun, quota, prompt quality, and agent ROI.' },
    { icon: 'bar-chart-outline', title: 'Power BI DirectQuery', description: 'Executive and ML dashboards built directly on the OneLake tokenomics tables — no data copy.' },
    { icon: 'chatbubbles-outline', title: 'Tokenomics Data Agent', description: 'A Foundry agent answers FinOps questions live via the Fabric Data Agent through the APIM gateway.' },
    { icon: 'people-outline', title: 'Attribution & chargeback', description: 'Every token attributed to business unit, department, team, project, cost center, and application.' },
    { icon: 'shield-checkmark-outline', title: 'Governed OBO security', description: 'On-behalf-of identity, private networking, and APIM policy across Foundry, Lakehouse, and Data Agent.' },
    { icon: 'options-outline', title: 'Config-driven deployment', description: 'A single deployment.json drives data, APIM, Foundry, Power BI, and UI — no hard-coded values.' },
  ];

  readonly architectureLayers: ArchitectureLayer[] = [
    { title: 'Ingestion', description: 'Multi-cloud token telemetry and published pricing.', items: ['AWS Bedrock', 'GCP Vertex AI', 'Azure OpenAI / Foundry', 'OpenAI Direct', 'Anthropic Claude'] },
    { title: 'Fabric Medallion Lakehouse', description: 'Governed Delta tables in OneLake.', items: ['Bronze / Silver provider schemas', 'Gold ml.tokenomics_usage_fact', '12 PySpark ML outputs (ml.*)', 'SQL analytics endpoint'] },
    { title: 'Serving & Intelligence', description: 'APIs, agent, and BI on one source of truth.', items: ['Python FastAPI service', 'Foundry Tokenomics agent', 'Fabric Data Agent (MCP)', 'Power BI DirectQuery'] },
    { title: 'Experience & Governance', description: 'Secure, responsive control plane.', items: ['Angular / Ionic CostOps UI', 'APIM gateway + OBO identity', 'Private networking', 'Entra ID sign-in'] },
  ];

  setTab(tab: ShowcaseTab): void { this.activeTab.set(tab); }
  selectVideo(index: number): void { this.selectedVideoIndex.set(index); }
  selectValueMode(id: ValueModeId): void { this.selectedValueModeId.set(id); }
}
