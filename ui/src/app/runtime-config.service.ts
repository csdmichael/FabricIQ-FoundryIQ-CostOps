import { Injectable } from '@angular/core';
import type { RuntimeConfig } from './tokenomics.model';

const unconfiguredRuntime: RuntimeConfig = {
  apiBaseUrl: '',
  tenantId: '',
  clientId: '',
  scope: '',
  environment: 'Unconfigured',
};

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private configPromise?: Promise<RuntimeConfig>;

  load(): Promise<RuntimeConfig> {
    this.configPromise ??= fetch('runtime-config.json', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return unconfiguredRuntime;
        const config = await response.json() as Partial<RuntimeConfig>;
        return { ...unconfiguredRuntime, ...config };
      })
      .catch(() => unconfiguredRuntime);
    return this.configPromise;
  }
}