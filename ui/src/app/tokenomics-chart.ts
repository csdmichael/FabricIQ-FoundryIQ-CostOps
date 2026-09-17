import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import type { TokenomicsRow } from './tokenomics.model';

Chart.register(BarController, BarElement, CategoryScale, DoughnutController, ArcElement, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip);

@Component({
  selector: 'app-tokenomics-chart',
  standalone: true,
  template: '<canvas #canvas role="img" [attr.aria-label]="label"></canvas>',
  styles: [':host { display: block; height: 100%; min-height: 240px; } canvas { width: 100% !important; height: 100% !important; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokenomicsChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input() mode: 'trend' | 'allocation' = 'trend';
  @Input() rows: TokenomicsRow[] = [];
  @Input() currency = 'USD';
  @Input() label = 'Tokenomics chart';
  @ViewChild('canvas') private canvas?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  ngAfterViewInit(): void { this.render(); }
  ngOnChanges(): void { if (this.canvas) this.render(); }
  ngOnDestroy(): void { this.chart?.destroy(); }

  private render(): void {
    this.chart?.destroy();
    if (!this.canvas) return;
    this.chart = new Chart(this.canvas.nativeElement, this.mode === 'trend' ? this.trendConfiguration() : this.allocationConfiguration());
  }

  private trendConfiguration(): ChartConfiguration {
    const buckets = new Map<string, { tokens: number; cost: number }>();
    for (const row of this.rows) {
      const key = row.TimeBucket ?? 'Unknown';
      const bucket = buckets.get(key) ?? { tokens: 0, cost: 0 };
      bucket.tokens += row.TotalTokens ?? 0;
      bucket.cost += row.NegotiatedCost ?? row.MarketCost ?? 0;
      buckets.set(key, bucket);
    }
    const entries = [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right));
    return {
      type: 'bar',
      data: {
        labels: entries.map(([date]) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date))),
        datasets: [
          { type: 'bar', label: 'Tokens', data: entries.map(([, value]) => value.tokens / 1_000_000), backgroundColor: '#16a3a5', borderRadius: 3, yAxisID: 'y' },
          { type: 'line', label: 'Cost', data: entries.map(([, value]) => value.cost), borderColor: '#f06435', backgroundColor: '#f06435', pointBackgroundColor: '#ffffff', pointBorderWidth: 3, pointRadius: 4, borderWidth: 3, tension: 0.28, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#52606f', font: { family: 'Aptos, Segoe UI, sans-serif' } } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#667384' } },
          y: { beginAtZero: true, grid: { color: '#e5e8eb' }, title: { display: true, text: 'Million tokens', color: '#667384' }, ticks: { color: '#667384' } },
          y1: { beginAtZero: true, position: 'right', grid: { display: false }, title: { display: true, text: this.currency, color: '#667384' }, ticks: { color: '#667384' } },
        },
      },
    };
  }

  private allocationConfiguration(): ChartConfiguration<'doughnut'> {
    return {
      type: 'doughnut',
      data: {
        labels: this.rows.map(row => row.TeamId ?? row.ApplicationId ?? 'Unattributed'),
        datasets: [{
          data: this.rows.map(row => row.NegotiatedCost ?? row.MarketCost ?? row.TotalTokens ?? 0),
          backgroundColor: ['#1678c8', '#16a3a5', '#f06435', '#6b3fa0', '#2f7d32', '#d9a400'],
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 5,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, color: '#52606f', font: { family: 'Aptos, Segoe UI, sans-serif' } } } },
      },
    };
  }
}