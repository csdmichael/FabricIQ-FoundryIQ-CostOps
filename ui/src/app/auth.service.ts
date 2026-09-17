import { Injectable, signal } from '@angular/core';
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';
import type { RuntimeConfig } from './tokenomics.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private client?: PublicClientApplication;
  private config?: RuntimeConfig;
  readonly account = signal<AccountInfo | null>(null);

  async configure(config: RuntimeConfig): Promise<void> {
    this.config = config;
    if (config.demoMode || !config.tenantId || !config.clientId) return;
    this.client = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await this.client.initialize();
    const redirect = await this.client.handleRedirectPromise();
    this.account.set(redirect?.account ?? this.client.getAllAccounts()[0] ?? null);
  }

  async signIn(): Promise<void> {
    if (!this.client || !this.config) return;
    const result = await this.client.loginPopup({ scopes: [this.config.scope], prompt: 'select_account' });
    this.account.set(result.account);
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const account = this.account();
    this.account.set(null);
    await this.client.logoutPopup({ account });
  }

  async accessToken(): Promise<string | null> {
    if (this.config?.demoMode) return null;
    if (!this.client || !this.config) throw new Error('Authentication is not configured.');
    if (!this.account()) await this.signIn();
    try {
      const result = await this.client.acquireTokenSilent({ account: this.account()!, scopes: [this.config.scope] });
      return result.accessToken;
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error;
      const result = await this.client.acquireTokenPopup({ scopes: [this.config.scope] });
      this.account.set(result.account);
      return result.accessToken;
    }
  }
}