import { Injectable, signal } from '@angular/core';
import type { ChatMessage } from './tokenomics.model';

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  threadId: string | null;
  messages: ChatMessage[];
}

const STORAGE_KEY = 'costops_chat_history';
const MAX_CONVERSATIONS = 50;

/**
 * Persists Foundry Agent conversations to localStorage so users can start a new
 * chat and retrieve past ones (Copilot-style history).
 */
@Injectable({ providedIn: 'root' })
export class ChatHistoryService {
  readonly conversations = signal<ChatConversation[]>([]);

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? (JSON.parse(stored) as ChatConversation[]) : [];
      this.conversations.set(parsed.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch {
      this.conversations.set([]);
    }
  }

  private persist(list: ChatConversation[]): void {
    const trimmed = list.slice(0, MAX_CONVERSATIONS);
    this.conversations.set(trimmed);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage quota / restricted contexts.
    }
  }

  private deriveTitle(messages: ChatMessage[]): string {
    const firstUser = messages.find(m => m.sender === 'user');
    const text = (firstUser?.content ?? 'New conversation').trim();
    return text.length > 60 ? text.slice(0, 57) + '…' : text;
  }

  /** Create or update a conversation from the current live messages. */
  save(id: string, messages: ChatMessage[], threadId: string | null): void {
    // Only persist conversations that have at least one user turn.
    if (!messages.some(m => m.sender === 'user')) return;
    const list = [...this.conversations()];
    const existing = list.findIndex(c => c.id === id);
    const record: ChatConversation = {
      id,
      title: this.deriveTitle(messages),
      updatedAt: Date.now(),
      threadId,
      messages,
    };
    if (existing >= 0) {
      list[existing] = record;
    } else {
      list.unshift(record);
    }
    this.persist(list.sort((a, b) => b.updatedAt - a.updatedAt));
  }

  get(id: string): ChatConversation | undefined {
    return this.conversations().find(c => c.id === id);
  }

  remove(id: string): void {
    this.persist(this.conversations().filter(c => c.id !== id));
  }

  clearAll(): void {
    this.persist([]);
  }
}
