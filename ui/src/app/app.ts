import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  analyticsOutline,
  cashOutline,
  flashOutline,
  gridOutline,
  informationCircleOutline,
  logInOutline,
  logOutOutline,
  peopleOutline,
  pulseOutline,
  refreshOutline,
  serverOutline,
  shieldCheckmarkOutline,
  speedometerOutline,
  warningOutline,
  walletOutline,
} from 'ionicons/icons';
import { AuthService } from './auth.service';
import { TokenomicsChart } from './tokenomics-chart';
import { TokenomicsService } from './tokenomics.service';
import type { DashboardView, TokenomicsRow, WindowDays } from './tokenomics.model';

@Component({
  selector: 'app-root',
  imports: [CommonModule, IonApp, IonButton, IonIcon, IonSegment, IonSegmentButton, IonSpinner, TokenomicsChart],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  readonly dashboard = signal<Awaited<ReturnType<TokenomicsService['dashboard']>> | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly windowDays = signal<WindowDays>(30);
  readonly activeView = signal<DashboardView>('overview');
  readonly lastUpdated = computed(() => {
    const value = this.dashboard()?.generatedAt;
    return value ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : '';
  });
  readonly successRate = computed(() => {
    const summary = this.dashboard()?.summary;
    return !summary?.requests ? 0 : summary.successfulRequests / summary.requests * 100;
  });
  readonly costPerTokenizedRequest = computed(() => {
    const data = this.dashboard();
    const cost = data?.actualCost.dedicatedModelCost;
    return !data?.summary.tokenizedRequests || cost === null || cost === undefined ? null : cost / data.summary.tokenizedRequests;
  });
  readonly topAllocations = computed(() => {
    const grouped = new Map<string, TokenomicsRow>();
    const addNullable = (left: number | null | undefined, right: number | null | undefined): number | null => (
      left === null || left === undefined
        ? right ?? null
        : right === null || right === undefined ? left : left + right
    );
    for (const row of this.dashboard()?.allocations ?? []) {
      const key = [row.ApplicationId, row.ProjectId, row.TeamId, row.CostCenter].join('|');
      const current = grouped.get(key);
      grouped.set(key, current ? {
        ...current,
        Requests: (current.Requests ?? 0) + (row.Requests ?? 0),
        TotalTokens: (current.TotalTokens ?? 0) + (row.TotalTokens ?? 0),
        MarketCost: addNullable(current.MarketCost, row.MarketCost),
        NegotiatedCost: addNullable(current.NegotiatedCost, row.NegotiatedCost),
        ActualCost: addNullable(current.ActualCost, row.ActualCost),
        Model: current.Model || row.Model,
      } : { ...row });
    }
    return [...grouped.values()].sort((left, right) => (
      (right.ActualCost ?? right.TotalTokens ?? 0)
      - (left.ActualCost ?? left.TotalTokens ?? 0)
    ));
  });

  constructor(
    readonly tokenomics: TokenomicsService,
    readonly auth: AuthService,
  ) {
    addIcons({ analyticsOutline, cashOutline, flashOutline, gridOutline, informationCircleOutline, logInOutline, logOutOutline, peopleOutline, pulseOutline, refreshOutline, serverOutline, shieldCheckmarkOutline, speedometerOutline, warningOutline, walletOutline });
  }

  async ngOnInit(): Promise<void> {
    await this.tokenomics.initialize();
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.dashboard.set(await this.tokenomics.dashboard(this.windowDays()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The dashboard is temporarily unavailable.');
    } finally {
      this.loading.set(false);
    }
  }

  async selectWindow(value: unknown): Promise<void> {
    const days = Number(value) as WindowDays;
    if (![1, 7, 30, 90].includes(days)) return;
    this.windowDays.set(days);
    await this.refresh();
  }

  setView(view: DashboardView): void {
    this.activeView.set(view);
    const frame = document.querySelector<HTMLElement>('.app-frame');
    if (!frame) return;
    if (window.matchMedia('(max-width: 767px)').matches) {
      frame.scrollTop = 0;
      return;
    }
    const target = document.querySelector<HTMLElement>(`.${view}-view`);
    if (!target) return;
    frame.scrollTop = Math.max(0, target.getBoundingClientRect().top + frame.scrollTop - 20);
  }

  async toggleAuthentication(): Promise<void> {
    if (this.auth.account()) await this.auth.signOut();
    else await this.auth.signIn();
    if (this.tokenomics.configured()) await this.refresh();
  }

  compact(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  integer(value: number | undefined): string {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value ?? 0);
  }

  percent(value: number): string {
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)}%`;
  }

  money(value: number | null | undefined, maximumFractionDigits = 0): string {
    if (value === null || value === undefined) return 'Not priced';
    return new Intl.NumberFormat('en', { style: 'currency', currency: this.dashboard()?.currency ?? 'USD', maximumFractionDigits }).format(value);
  }

  allocationShare(row: TokenomicsRow): number {
    const total = this.dashboard()?.summary.totalTokens ?? 0;
    return total ? (row.TotalTokens ?? 0) / total * 100 : 0;
  }

  operationSuccess(row: TokenomicsRow): number {
    return !row.Requests ? 0 : (row.Successes ?? 0) / row.Requests * 100;
  }
}
