import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';
import type { ChatChart } from './tokenomics.model';

Chart.register(...registerables);

/** Renders a bar/line chart derived from a Data Agent result table. */
@Component({
  selector: 'app-result-chart',
  standalone: true,
  template: `<div class="result-chart-host"><canvas #canvas></canvas></div>`,
  styles: [`
    :host { display: block; }
    .result-chart-host { position: relative; height: 260px; width: 100%; }
  `],
})
export class ResultChart implements AfterViewInit, OnChanges, OnDestroy {
  @Input() chart: ChatChart | null = null;
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  private instance?: Chart;

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(): void {
    this.render();
  }

  private render(): void {
    if (!this.canvasRef?.nativeElement || !this.chart) return;
    this.instance?.destroy();
    const palette = ['#1678c8', '#16a3a5', '#6b3fa0', '#f06435', '#2f7d32', '#bf3b45', '#0f6cbd', '#c19c00', '#8a3ffc', '#e8710a', '#1a7f64', '#d1345b'];
    const isCircular = this.chart.type === 'pie' || this.chart.type === 'doughnut';
    this.instance = new Chart(this.canvasRef.nativeElement, {
      type: this.chart.type,
      data: {
        labels: this.chart.labels,
        datasets: [{
          label: this.chart.valueLabel,
          data: this.chart.values,
          backgroundColor: isCircular
            ? this.chart.labels.map((_, i) => palette[i % palette.length])
            : (this.chart.type === 'line' ? 'rgba(22,120,200,.15)' : this.chart.labels.map((_, i) => palette[i % palette.length])),
          borderColor: this.chart.type === 'line' ? '#1678c8' : (isCircular ? '#fff' : 'transparent'),
          borderWidth: this.chart.type === 'line' ? 2 : (isCircular ? 2 : 0),
          borderRadius: this.chart.type === 'bar' ? 4 : 0,
          fill: this.chart.type === 'line',
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: isCircular ? 'right' : 'bottom',
            labels: { boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = Number(ctx.parsed?.y ?? ctx.parsed ?? 0);
                return `${ctx.label}: ${this.compact(val)}`;
              },
            },
          },
        },
        scales: isCircular ? {} : {
          x: { ticks: { font: { size: 10 }, maxRotation: 40, minRotation: 0 }, grid: { display: false } },
          y: { ticks: { font: { size: 10 }, callback: (v) => this.compact(Number(v)) }, grid: { color: '#eef1f4' } },
        },
      },
    });
  }

  private compact(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  ngOnDestroy(): void {
    this.instance?.destroy();
  }
}
