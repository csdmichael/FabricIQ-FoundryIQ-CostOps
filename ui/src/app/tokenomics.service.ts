import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';
import { demoDashboard, type RuntimeConfig, type TokenomicsDashboard, type WindowDays } from './tokenomics.model';

@Injectable({ providedIn: 'root' })
export class TokenomicsService {
  private config?: RuntimeConfig;
  readonly demoMode = signal(true);
  readonly environment = signal('Demo');

  constructor(
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly auth: AuthService,
  ) {}

  async initialize(): Promise<void> {
    this.config = await this.runtimeConfig.load();
    this.demoMode.set(this.config.demoMode);
    this.environment.set(this.config.environment);
    await this.auth.configure(this.config);
  }

  async dashboard(days: WindowDays): Promise<TokenomicsDashboard> {
    if (!this.config) await this.initialize();
    if (this.config!.demoMode) return { ...structuredClone(demoDashboard), windowDays: days, generatedAt: new Date().toISOString() };
    if (!this.config!.apiBaseUrl || !this.config!.scope) throw new Error('The live dashboard configuration is incomplete.');
    const token = await this.auth.accessToken();
    const response = await fetch(`${this.config!.apiBaseUrl.replace(/\/$/, '')}/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Dashboard API returned ${response.status}.`);
    return response.json() as Promise<TokenomicsDashboard>;
  }
}