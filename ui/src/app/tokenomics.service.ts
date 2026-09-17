import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';
import type { RuntimeConfig, TokenomicsDashboard, WindowDays } from './tokenomics.model';

@Injectable({ providedIn: 'root' })
export class TokenomicsService {
  private config?: RuntimeConfig;
  readonly configured = signal(false);
  readonly environment = signal('Unconfigured');

  constructor(
    private readonly runtimeConfig: RuntimeConfigService,
    private readonly auth: AuthService,
  ) {}

  async initialize(): Promise<void> {
    this.config = await this.runtimeConfig.load();
    this.environment.set(this.config.environment);
    this.configured.set(Boolean(this.config.apiBaseUrl && this.config.tenantId && this.config.clientId && this.config.scope));
    if (!this.configured()) return;
    await this.auth.configure(this.config);
  }

  async dashboard(days: WindowDays): Promise<TokenomicsDashboard> {
    if (!this.config) await this.initialize();
    if (!this.configured()) throw new Error('Live CostOps configuration is required. Run identity provisioning and scripts/build-ui.ps1.');
    const token = await this.auth.accessToken();
    const response = await fetch(`${this.config!.apiBaseUrl.replace(/\/$/, '')}/summary?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Dashboard API returned ${response.status}.`);
    return response.json() as Promise<TokenomicsDashboard>;
  }
}