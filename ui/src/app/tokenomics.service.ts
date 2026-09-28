import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { configApiError, networkApiError, toApiError } from './api-error';
import { formatAgentReply } from './chat-format';
import { ML_USE_CASES } from './mock-data';
import { RuntimeConfigService } from './runtime-config.service';
import type {
  ActionRecommendationsResponse,
  ChatApiResponse,
  ChatMessage,
  MlUseCaseInfo,
  ModelPriceItem,
  PowerBiEmbedConfig,
  PromptsApiResponse,
  RuntimeConfig,
  SavedPrompt,
  ShowcaseVisitsReport,
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

  private async authorizedFetch(path: string, init: RequestInit = {}, opts: { retries?: number; timeoutMs?: number } = {}): Promise<Response> {
    if (!this.apiBase()) throw configApiError();
    const token = await this.auth.accessToken();
    const headers = new Headers(init.headers ?? {});
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const retries = opts.retries ?? 1;
    const timeoutMs = opts.timeoutMs ?? 12000;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${this.apiBase()}${path}`, { ...init, headers, cache: 'no-store', signal: controller.signal });
        clearTimeout(timer);
        // Ride out a Fabric cold start: one quick retry on transient 5xx.
        if (response.status >= 500 && response.status <= 599 && attempt < retries) {
          await this.delay(500);
          continue;
        }
        return response;
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (attempt < retries) {
          await this.delay(500);
          continue;
        }
        throw networkApiError(error);
      }
    }
    throw networkApiError(lastError);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async dashboard(days: WindowDays): Promise<TokenomicsDashboard> {
    if (!this.config) await this.initialize();
    const response = await this.authorizedFetch(`/summary?days=${days}`);
    if (!response.ok) {
      throw await toApiError(response);
    }
    const data = await response.json() as TokenomicsDashboard;
    this.isLiveMode.set(true);
    return data;
  }

  async recordShowcaseVisit(): Promise<void> {
    if (!this.config) {
      this.config = await this.runtimeConfig.load();
    }
    const apiBase = this.apiBase();
    if (!apiBase) {
      console.warn('Showcase visit tracking is unavailable: API base URL is not configured.');
      return;
    }
    try {
      const response = await fetch(`${apiBase}/showcase/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        }),
        cache: 'no-store',
        keepalive: true,
      });
      if (!response.ok) {
        console.warn(`Showcase visit tracking failed (HTTP ${response.status}).`);
      }
    } catch (error) {
      console.warn('Showcase visit tracking failed:', error);
    }
  }

  async getShowcaseVisits(days: WindowDays): Promise<ShowcaseVisitsReport> {
    if (!this.config) await this.initialize();
    const response = await this.authorizedFetch(`/showcase/visits?days=${days}`);
    if (!response.ok) {
      throw await toApiError(response);
    }
    return await response.json() as ShowcaseVisitsReport;
  }

  /** Data-driven FinOps action recommendations (the closed feedback loop). */
  async getActionRecommendations(days: WindowDays): Promise<ActionRecommendationsResponse> {
    if (!this.config) await this.initialize();
    const response = await this.authorizedFetch(`/actions?days=${days}`);
    if (!response.ok) {
      throw await toApiError(response);
    }
    this.isLiveMode.set(true);
    return await response.json() as ActionRecommendationsResponse;
  }

  async getModelPricingCatalog(): Promise<ModelPriceItem[]> {    if (!this.config) await this.initialize();
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
    // Foundry agent runs poll through several LLM + Fabric tool-call round trips and can
    // legitimately take well over a minute for analytical questions, so give this call a
    // much longer budget than the default 12s used for simple GET queries. No automatic
    // retry: the agent run/thread messages are already created server-side on the first
    // attempt, so retrying would just double the wait and could duplicate messages.
    const response = await this.authorizedFetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: promptText, threadId: this.chatThreadId }),
    }, { retries: 0, timeoutMs: 150000 });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Foundry Agent unavailable (HTTP ${response.status}). ${detail}`);
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

  /** Current Foundry thread id (for saving conversation history). */
  getChatThreadId(): string | null {
    return this.chatThreadId;
  }

  /** Restore a Foundry thread id when reopening a saved conversation. */
  setChatThreadId(threadId: string | null): void {
    this.chatThreadId = threadId;
  }
}
