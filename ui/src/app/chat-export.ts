import { Injectable } from '@angular/core';
import { saveAs } from 'file-saver';
import type { ChatMessage } from './tokenomics.model';

/**
 * Exports a Foundry Agent response (prose + tables) to Excel, PowerPoint, or Word.
 * Libraries are imported dynamically so they do not bloat the initial bundle.
 */
@Injectable({ providedIn: 'root' })
export class ChatExportService {
  private plainText(message: ChatMessage): string {
    return (message.content || '')
      .replace(/\|/g, ' ')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim();
  }

  private fileStamp(): string {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  }

  async toExcel(message: ChatMessage): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const summary = [['Tokenomics Foundry Agent'], [this.plainText(message)]];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
    (message.tables ?? []).forEach((t, i) => {
      const aoa = [t.headers, ...t.rows];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, (t.title || `Table ${i + 1}`).slice(0, 28));
    });
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `tokenomics-${this.fileStamp()}.xlsx`);
  }

  async toPowerPoint(message: ChatMessage): Promise<void> {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();
    pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
    pptx.layout = 'WIDE';

    const title = pptx.addSlide();
    title.addText('Tokenomics FinOps Analyst', { x: 0.5, y: 0.6, w: 12.3, h: 0.8, fontSize: 28, bold: true, color: '102644' });
    title.addText(this.plainText(message).slice(0, 1200), { x: 0.5, y: 1.6, w: 12.3, h: 5.2, fontSize: 14, color: '333333', valign: 'top' });

    (message.tables ?? []).forEach((t, i) => {
      const slide = pptx.addSlide();
      slide.addText(t.title || `Table ${i + 1}`, { x: 0.5, y: 0.3, w: 12.3, h: 0.5, fontSize: 18, bold: true, color: '1678c8' });
      const tableRows = [
        t.headers.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: '102644' } } })),
        ...t.rows.map(r => r.map(c => ({ text: c, options: {} }))),
      ];
      slide.addTable(tableRows as any, { x: 0.5, y: 1.0, w: 12.3, fontSize: 10, border: { type: 'solid', color: 'DCE1E6', pt: 1 } });
      if (t.chart) {
        const chartSlide = pptx.addSlide();
        chartSlide.addText(`${t.title || 'Table ' + (i + 1)} — ${t.chart.valueLabel}`, { x: 0.5, y: 0.3, w: 12.3, h: 0.5, fontSize: 18, bold: true, color: '1678c8' });
        chartSlide.addChart('bar' as any, [{ name: t.chart.valueLabel, labels: t.chart.labels, values: t.chart.values }], { x: 0.5, y: 1.0, w: 12.3, h: 5.8, showLegend: true, legendPos: 'b' });
      }
    });
    const blob = await pptx.write({ outputType: 'blob' }) as Blob;
    saveAs(blob, `tokenomics-${this.fileStamp()}.pptx`);
  }

  async toWord(message: ChatMessage): Promise<void> {
    // Word opens an HTML document with full fidelity (headings, tables, styles).
    // Using HTML avoids the Node-only `buffer` dependency of docx in the browser.
    const esc = (s: string) => (s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tablesHtml = (message.tables ?? []).map((t, i) => {
      const head = t.headers.map(h => `<th style="background:#102644;color:#fff;padding:6px 10px;border:1px solid #dce1e6;text-align:left;">${esc(h)}</th>`).join('');
      const body = t.rows.map(r => `<tr>${r.map(c => `<td style="padding:6px 10px;border:1px solid #dce1e6;">${esc(c)}</td>`).join('')}</tr>`).join('');
      return `<h2 style="color:#1678c8;">${esc(t.title || 'Table ' + (i + 1))}</h2>`
        + `<table style="border-collapse:collapse;width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:12px;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }).join('<br/>');
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head>`
      + `<body style="font-family:Segoe UI,Arial,sans-serif;">`
      + `<h1 style="color:#102644;">Tokenomics FinOps Analyst</h1>`
      + `<p style="font-size:13px;white-space:pre-wrap;">${esc(this.plainText(message))}</p>`
      + tablesHtml
      + `</body></html>`;
    saveAs(new Blob(['\ufeff' + html], { type: 'application/msword' }), `tokenomics-${this.fileStamp()}.doc`);
  }
}
