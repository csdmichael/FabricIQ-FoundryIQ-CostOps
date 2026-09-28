import { Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/standalone';
import { ResultChart } from './result-chart';
import type { ChatChart, ChatTable } from './tokenomics.model';

type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';

/**
 * Renders a Foundry Agent result table with a Table / Chart tab switch and small
 * buttons to change the chart type (bar, line, pie, doughnut).
 */
@Component({
  selector: 'app-result-block',
  standalone: true,
  imports: [CommonModule, IonIcon, ResultChart],
  template: `
    <div class="result-block">
      @if (table.title) { <div class="rb-title">{{ table.title }}</div> }

      <div class="rb-tabs">
        <button type="button" [class.active]="tab() === 'table'" (click)="tab.set('table')">
          <ion-icon name="grid-outline"></ion-icon> Table
        </button>
        @if (table.chart) {
          <button type="button" [class.active]="tab() === 'chart'" (click)="tab.set('chart')">
            <ion-icon name="bar-chart-outline"></ion-icon> Chart
          </button>
        }
      </div>

      @if (tab() === 'table') {
        <div class="msg-table-wrap">
          <table>
            <thead>
              <tr>@for (h of table.headers; track h) { <th>{{ h }}</th> }</tr>
            </thead>
            <tbody>
              @for (r of table.rows; track $index) {
                <tr>@for (c of r; track $index) { <td>{{ c }}</td> }</tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (table.chart) {
        <div class="rb-chart-toolbar">
          <span class="rb-chart-label">Chart type:</span>
          @for (t of chartTypes; track t.id) {
            <button type="button" class="rb-type-btn" [class.active]="chartType() === t.id" (click)="setType(t.id)" [title]="t.label">
              <ion-icon [name]="t.icon"></ion-icon>
            </button>
          }
        </div>
        <app-result-chart [chart]="activeChart()"></app-result-chart>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .result-block { margin: 12px 0; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--surface); }
    .rb-title { padding: 8px 12px; font-size: 12.5px; font-weight: 700; color: var(--ink); background: #f8f9fb; border-bottom: 1px solid var(--line); }
    .rb-tabs { display: flex; gap: 2px; padding: 6px 8px 0; border-bottom: 1px solid var(--line); }
    .rb-tabs button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border: 0; background: transparent; color: var(--muted); font-size: 12.5px; font-weight: 700; border-bottom: 2px solid transparent; cursor: pointer; }
    .rb-tabs button ion-icon { font-size: 15px; }
    .rb-tabs button.active { color: var(--blue); border-bottom-color: var(--blue); }
    .msg-table-wrap { padding: 4px; }
    .rb-chart-toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 12px 0; }
    .rb-chart-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; }
    .rb-type-btn { width: 30px; height: 28px; display: grid; place-items: center; border: 1px solid var(--line); background: var(--surface); border-radius: 6px; color: #52606f; cursor: pointer; }
    .rb-type-btn ion-icon { font-size: 15px; }
    .rb-type-btn:hover { border-color: var(--blue); color: var(--blue); }
    .rb-type-btn.active { background: var(--blue); border-color: var(--blue); color: #fff; }
    app-result-chart { display: block; padding: 8px 12px 12px; }
  `],
})
export class ResultBlock {
  @Input() table!: ChatTable;

  readonly tab = signal<'table' | 'chart'>('table');
  readonly chartType = signal<ChartType>('bar');

  readonly chartTypes: { id: ChartType; label: string; icon: string }[] = [
    { id: 'bar', label: 'Bar chart', icon: 'bar-chart-outline' },
    { id: 'line', label: 'Line chart', icon: 'trending-up-outline' },
    { id: 'pie', label: 'Pie chart', icon: 'pie-chart-outline' },
    { id: 'doughnut', label: 'Doughnut chart', icon: 'ellipse-outline' },
  ];

  ngOnInit(): void {
    // Default to the chart's suggested type (e.g. pie from a Mermaid block).
    if (this.table?.chart?.type) {
      this.chartType.set(this.table.chart.type as ChartType);
      // If the source is a pie/distribution, open on the Chart tab.
      if (this.table.chart.type === 'pie' || this.table.chart.type === 'doughnut') {
        this.tab.set('chart');
      }
    }
  }

  setType(type: ChartType): void {
    this.chartType.set(type);
  }

  activeChart(): ChatChart | null {
    if (!this.table.chart) return null;
    return { ...this.table.chart, type: this.chartType() };
  }
}
