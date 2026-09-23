import { Injectable, signal } from '@angular/core';
import type { SavedPrompt } from './tokenomics.model';

const STORAGE_KEY = 'costops_custom_prompts';

@Injectable({ providedIn: 'root' })
export class PromptLibraryService {
  readonly prompts = signal<SavedPrompt[]>([]);
  readonly selectedCategory = signal<string>('All');
  private serverPrompts: SavedPrompt[] = [];
  readonly categories = [
    'All',
    'Executive & FinOps',
    'Cost Anomalies & Spikes',
    'Model Optimization',
    'Quota & Capacity',
    'Prompt Quality'
  ];

  constructor() {
    this.loadPrompts();
  }

  /** Seed the library with server-provided sample prompts, merged with custom ones. */
  setServerPrompts(serverPrompts: SavedPrompt[]): void {
    this.serverPrompts = serverPrompts ?? [];
    this.prompts.set([...this.serverPrompts, ...this.loadCustom()]);
  }

  private loadCustom(): SavedPrompt[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as SavedPrompt[]) : [];
    } catch {
      return [];
    }
  }

  loadPrompts(): void {
    this.prompts.set([...this.serverPrompts, ...this.loadCustom()]);
  }

  addPrompt(item: Omit<SavedPrompt, 'id' | 'isCustom'>): SavedPrompt {
    const newPrompt: SavedPrompt = {
      ...item,
      id: `custom-${Date.now()}`,
      isCustom: true
    };
    const current = this.prompts();
    const updated = [...current, newPrompt];
    this.prompts.set(updated);
    this.persistCustom(updated.filter(p => p.isCustom));
    return newPrompt;
  }

  removePrompt(id: string): void {
    const updated = this.prompts().filter(p => p.id !== id);
    this.prompts.set(updated);
    this.persistCustom(updated.filter(p => p.isCustom));
  }

  private persistCustom(custom: SavedPrompt[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }

  filteredPrompts(): SavedPrompt[] {
    const category = this.selectedCategory();
    if (category === 'All') return this.prompts();
    return this.prompts().filter(p => p.category === category);
  }
}
