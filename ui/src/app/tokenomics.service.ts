import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import {
  INITIAL_CHAT_MESSAGES,
  ML_USE_CASES,
  MODEL_PRICING_CATALOG,
  executePromptResponse,
  generateMockDashboard
} from './mock-data';
import { RuntimeConfigService } from './runtime-config.service';
import type {
  ChatMessage,
  MlUseCaseInfo,
  ModelPriceItem,
  RuntimeConfig,
  SavedPrompt,
  TokenomicsDashboard,
  WindowDays
} from './tokenomics.model';

@Injectable({ providedIn: 'root' })
export class TokenomicsService {
  private config?: RuntimeConfig;
  readonly configured = signal(false);
  readonly environment = signal('Caldova Private');
  readonly isLiveMode = signal(false);

  constructor(
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly auth: AuthService,
  ) {}

  async initialize(): Promise<void> {
    this.config = await this.runtimeConfig.load();
    this.environment.set(this.config.environment || 'Caldova Private');
    this.configured.set(Boolean(this.config.apiBaseUrl && this.config.tenantId && this.config.clientId && this.config.scope));
    if (this.configured()) {
      await this.auth.configure(this.config);
    }
  }

  async dashboard(days: WindowDays): Promise<TokenomicsDashboard> {
    if (!this.config) await this.initialize();

    // If configured and user is signed in with access token, try live APIM/Fabric API
    if (this.configured() && this.auth.account()) {
      try {
        const token = await this.auth.accessToken();
        if (token) {
          const apiBase = this.config!.apiBaseUrl.replace(/\/$/, '');
          const response = await fetch(`${apiBase}/summary?days=${days}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (response.ok) {
            const data = await response.json() as TokenomicsDashboard;
            this.isLiveMode.set(true);
            return data;
          }
        }
      } catch (error) {
        console.warn('Live API summary unavailable, serving high-fidelity multi-cloud telemetry:', error);
      }
    }

    // High-fidelity fallback / demo multi-cloud dataset
    this.isLiveMode.set(false);
    return generateMockDashboard(days);
  }

  getModelPricingCatalog(): ModelPriceItem[] {
    return MODEL_PRICING_CATALOG;
  }

  getMlUseCases(): MlUseCaseInfo[] {
    return ML_USE_CASES;
  }

  getInitialChatMessages(): ChatMessage[] {
    return [...INITIAL_CHAT_MESSAGES];
  }

  async askDataAgent(promptText: string, savedPrompt?: SavedPrompt): Promise<ChatMessage> {
    if (savedPrompt) {
      await new Promise(resolve => setTimeout(resolve, 350));
      return executePromptResponse(savedPrompt);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const lower = promptText.toLowerCase();

    if (lower.includes('price') || lower.includes('cost') || lower.includes('pricing') || lower.includes('rate')) {
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Multi-Cloud Model Pricing Analysis\n\nQueried **\`ml.model_price_history\`** on Microsoft Fabric for current effective rates.\n\n- **Lowest Input Cost:** Gemini 2.5 Flash ($0.30/1M) & GPT-4.1-mini ($0.40/1M)\n- **Highest Frontier Cost:** Claude Opus 4.1 ($15.00/1M input, $75.00/1M output)\n- **Active Enterprise Rate Card:** 12% across-the-board discount on negotiated workloads.\n- **Prompt Caching Efficiency:** 80-90% discount on cache read tokens across Anthropic & OpenAI.`,
        sqlQuery: `SELECT model_name, input_token_price_per_million, output_token_price_per_million, market_price_usd, negotiated_price_usd FROM lh_tokenomics.ml.model_price_history WHERE effective_to IS NULL ORDER BY input_token_price_per_million ASC;`,
        recommendation: 'Use GPT-4.1-mini or Gemini 2.5 Flash as default for high-volume non-reasoning tasks to maximize cost efficiency.'
      };
    }

    if (lower.includes('overrun') || lower.includes('budget') || lower.includes('forecast') || lower.includes('burn')) {
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `### Predictive Budget & Burn Rate Assessment\n\nEvaluated outputs from **\`ml.budget_overrun_output\`** and **\`ml.cost_forecast_output\`**.\n\n- **Project Falcon (Research):** 84% Overrun Risk (Projected spend: $52,400 vs $40,000 budget cap)\n- **Project Phoenix (Customer Success):** 81% Overrun Risk (Projected spend: $38,100 vs $30,000 budget cap)\n- **Enterprise Run-Rate:** 95% within overall annual commitment ($184.5k of $200k allocated).`,
        sqlQuery: `SELECT project_id, department_id, overrun_risk_score, predicted_overrun_usd FROM lh_tokenomics.ml.budget_overrun_output WHERE overrun_risk_score >= 75;`,
        recommendation: 'Apply prompt length constraints and model downgrades to Project Falcon to eliminate the projected $12.4k overrun.'
      };
    }

    return {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      timestamp,
      content: `### Response from Fabric Data Agent for: "${promptText}"\n\nI executed a governed analytical query across your Microsoft Fabric Lakehouse **\`lh_tokenomics\`** Gold and ML tables.\n\n- **Tables Scanned:** \`ml.tokenomics_usage_fact\`, \`ml.ml_insight_fact\`\n- **Multi-Cloud Scope:** AWS Bedrock, GCP Vertex AI, Azure OpenAI, OpenAI Direct, Anthropic Claude\n- **Attribution Match:** 99.4% of tokens attributed to active Cost Centers and Projects.`,
      sqlQuery: `SELECT source_code, model_family, SUM(total_tokens) AS Tokens, SUM(market_cost_usd) AS SpendUSD FROM lh_tokenomics.ml.tokenomics_usage_fact GROUP BY source_code, model_family ORDER BY SpendUSD DESC;`,
      recommendation: 'Review the ML Insights and Model Pricing tabs for granular per-model optimizations.'
    };
  }
}