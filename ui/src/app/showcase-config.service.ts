import { Injectable } from '@angular/core';

export interface ShowcaseVideo {
  sequence: string;
  title: string;
  description: string;
  duration: string;
  source: string;
}

interface ShowcaseConfig {
  videos: ShowcaseVideo[];
}

@Injectable({ providedIn: 'root' })
export class ShowcaseConfigService {
  async load(): Promise<ShowcaseVideo[]> {
    const response = await fetch('/showcase-config.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Showcase configuration request failed with HTTP ${response.status}.`);
    }

    const config: unknown = await response.json();
    if (!this.isShowcaseConfig(config)) {
      throw new Error('Showcase configuration is invalid.');
    }

    return config.videos;
  }

  private isShowcaseConfig(value: unknown): value is ShowcaseConfig {
    if (!this.isRecord(value) || !Array.isArray(value['videos']) || value['videos'].length === 0) {
      return false;
    }

    return value['videos'].every(video =>
      this.isRecord(video)
      && this.isNonEmptyString(video['sequence'])
      && this.isNonEmptyString(video['title'])
      && this.isNonEmptyString(video['description'])
      && this.isNonEmptyString(video['duration'])
      && this.isNonEmptyString(video['source'])
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }
}
