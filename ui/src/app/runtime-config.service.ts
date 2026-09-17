import { Injectable } from '@angular/core';
import type { RuntimeConfig } from './tokenomics.model';

const demoConfig: RuntimeConfig = {
  apiBaseUrl: '',
  tenantId: '',
  clientId: '',
  scope: '',
  demoMode: true,
  environment: 'Demo',
};

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private configPromise?: Promise<RuntimeConfig>;

  load(): Promise<RuntimeConfig> {
    this.configPromise ??= fetch('runtime-config.json', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return demoConfig;
        const config = await response.json() as Partial<RuntimeConfig>;
        return { ...demoConfig, ...config };
      })
      .catch(() => demoConfig);
    return this.configPromise;
  }
}