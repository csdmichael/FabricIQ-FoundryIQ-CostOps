import { Injectable, signal } from '@angular/core';
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
} from '@azure/msal-browser';
import type { RuntimeConfig } from './tokenomics.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private client?: PublicClientApplication;
  private config?: RuntimeConfig;
  readonly account = signal<AccountInfo | null>(null);
  readonly initializing = signal(true);

  async configure(config: RuntimeConfig): Promise<void> {
    this.config = config;
    if (!config.tenantId || !config.clientId) {
      this.initializing.set(false);
      return;
    }
    try {
      this.client = new PublicClientApplication({
        auth: {
          clientId: config.clientId,
          authority: `https://login.microsoftonline.com/${config.tenantId}`,
          redirectUri: window.location.origin,
          postLogoutRedirectUri: window.location.origin,
        },
        cache: {
          cacheLocation: 'localStorage',
        },
      });
      await this.client.initialize();
      const redirect = await this.client.handleRedirectPromise();
      const currentAccount = redirect?.account ?? this.client.getAllAccounts()[0] ?? null;
      this.account.set(currentAccount);

      // If running inside a popup window that just completed authentication, close it
      if (typeof window !== 'undefined' && window.opener && window.opener !== window) {
        try {
          window.close();
          return;
        } catch {
          // Ignore popup close error
        }
      }

      // Clean auth code hash from URL after successful processing in the main window
      if (typeof window !== 'undefined' && window.location.hash && (window.location.hash.includes('code=') || window.location.hash.includes('error='))) {
        try {
          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
          }
        } catch {
          // Ignore URL cleanup failure
        }
      }
    } catch (error) {
      console.warn('MSAL configuration or redirect handling notice:', error);
      this.account.set(this.client?.getAllAccounts()[0] ?? null);
    } finally {
      this.initializing.set(false);
    }
  }

  async signIn(useRedirect = false): Promise<void> {
    if (!this.client || !this.config) return;
    if (useRedirect) {
      await this.client.loginRedirect({ scopes: [this.config.scope], prompt: 'select_account' });
      return;
    }
    try {
      const result: AuthenticationResult = await this.client.loginPopup({
        scopes: [this.config.scope],
        prompt: 'select_account'
      });
      this.account.set(result.account);
    } catch (error) {
      console.warn('Popup login failed, attempting redirect flow:', error);
      await this.client.loginRedirect({ scopes: [this.config.scope], prompt: 'select_account' });
    }
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    const account = this.account();
    this.account.set(null);
    try {
      await this.client.logoutPopup({ account });
    } catch {
      await this.client.logoutRedirect({ account });
    }
  }

  async accessToken(): Promise<string | null> {
    if (!this.client || !this.config) return null;
    const acc = this.account();
    if (!acc) return null;
    try {
      const result = await this.client.acquireTokenSilent({ account: acc, scopes: [this.config.scope] });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        try {
          const result = await this.client.acquireTokenPopup({ scopes: [this.config.scope] });
          this.account.set(result.account);
          return result.accessToken;
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}