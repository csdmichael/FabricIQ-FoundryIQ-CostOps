import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { formatAgentReply } from './chat-format';
import { ML_USE_CASES } from './mock-data';
import { RuntimeConfigService } from './runtime-config.service';
import type {
  ChatApiResponse,
  ChatMessage,
  MlUseCaseInfo,
  ModelPriceItem,
  PowerBiEmbedConfig,
  PromptsApiResponse,
  RuntimeConfig,
  SavedPrompt,
  TokenomicsDashboard,
  WindowDays
} from './tokenomics.model';

@Injectable({ providedIn: 'root' })
export class TokenomicsService {
  private config?: RuntimeConfig;
  private chatThreadId: string | null = null;
  readonly configured = signal(false);
  readonly environment = signal('Enterprise');
  readonly isLiveMode = signal(false);
  readonly agentName = signal('Tokenomics FinOps Analyst');
  readonly welcomeMessage = signal('');

  constructor(
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly auth: AuthService,
  ) {}

  async initialize(): Promise<void> {
    this.config = await this.runtimeConfig.load();
    this.environment.set(this.config.environment || 'Enterprise');
    this.configured.set(Boolean(this.config.apiBaseUrl && this.config.tenantId && this.config.clientId && this.config.scope));
    if (this.configured()) {
      await this.auth.configure(this.config);
    }
  }

  private apiBase(): string {
    return (this.config?.apiBaseUrl ?? '').replace(/\/$/, '');
  }

  private async authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.auth.accessToken();
    const headers = new Headers(init.headers ?? {});
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${this.apiBase()}${path}`, { ...init, headers, cache: 'no-store' });
  }

  async dashboard(days: WindowDays): Promise<TokenomicsDashboard> {
    if (!this.config) await this.initialize();
    const response = await this.authorizedFetch(`/summary?days=${days}`);
    if (!response.ok) {
      throw new Error(`Live tokenomics telemetry is unavailable (HTTP ${response.status}). Sign in and confirm the analytics API is reachable.`);
    }
    const data = await response.json() as TokenomicsDashboard;
    this.isLiveMode.set(true);
    return data;
  }

  async getModelPricingCatalog(): Promise<ModelPriceItem[]> {
    if (!this.config) await this.initialize();
    try {
      const response = await this.authorizedFetch('/pricing');
      if (response.ok) {
        return await response.json() as ModelPriceItem[];
      }
    } catch (error) {
      console.warn('Live pricing unavailable:', error);
    }
    return [];
  }

  getMlUseCases(): MlUseCaseInfo[] {
    return ML_USE_CASES;
  }

  async getPowerBiEmbedConfig(): Promise<PowerBiEmbedConfig | null> {
    if (!this.config) await this.initialize();
    try {
      const response = await this.authorizedFetch('/powerbi/embed');
      if (response.ok) {
        return await response.json() as PowerBiEmbedConfig;
      }
    } catch (error) {
      console.warn('Power BI embed configuration unavailable:', error);
    }
    return null;
  }

  async getSamplePrompts(): Promise<SavedPrompt[]> {
    if (!this.config) await this.initialize();
    try {
      const response = await this.authorizedFetch('/prompts');
      if (response.ok) {
        const data = await response.json() as PromptsApiResponse;
        if (data.agent) this.agentName.set(data.agent);
        if (data.welcomeMessage) this.welcomeMessage.set(data.welcomeMessage);
        return data.prompts ?? [];
      }
    } catch (error) {
      console.warn('Sample prompts unavailable:', error);
    }
    return [];
  }

  getInitialChatMessages(): ChatMessage[] {
    const content = this.welcomeMessage() || `Hello! I am your **${this.agentName()}**. Ask me any question about multi-cloud AI spend, model pricing, budget overruns, quota, or prompt quality — I answer using the governed tokenomics lakehouse.`;
    const formatted = formatAgentReply(content);
    return [
      {
        id: 'welcome-1',
        sender: 'agent',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content,
        htmlContent: formatted.html,
      }
    ];
  }

  async askDataAgent(promptText: string, _savedPrompt?: SavedPrompt): Promise<ChatMessage> {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const response = await this.authorizedFetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: promptText, threadId: this.chatThreadId }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Data Agent unavailable (HTTP ${response.status}). ${detail}`);
    }
    const data = await response.json() as ChatApiResponse;
    this.chatThreadId = data.threadId ?? this.chatThreadId;
    const citationText = data.citations?.length
      ? `\n\n**Sources:** ${data.citations.map(c => `\`${c}\``).join(', ')}`
      : '';
    const content = `${data.reply}${citationText}`;
    const formatted = formatAgentReply(content);
    return {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      timestamp,
      content,
      htmlContent: formatted.html,
      tables: formatted.tables,
    };
  }

  resetChatThread(): void {
    this.chatThreadId = null;
  }
}
