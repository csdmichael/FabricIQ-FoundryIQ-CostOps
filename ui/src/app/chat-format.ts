import type { ChatChart, ChatTable } from './tokenomics.model';

/**
 * Parses a Foundry Agent markdown reply into rich content: prose rendered as HTML,
 * plus structured tables (each with a derived chart when it has a label column
 * and at least one numeric column). This turns raw pipe-delimited markdown into
 * high-fidelity tables and charts in the UI.
 */
export interface FormattedReply {
  html: string;
  tables: ChatTable[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Minimal, safe markdown-to-HTML for the agent's prose (no raw HTML passthrough). */
function proseToHtml(lines: string[]): string {
  const html: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  const inline = (text: string): string => {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return out;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(6, Math.max(4, heading[1].length + 3));
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return html.join('');
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.includes('|');
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-');
}

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

/** Parse "$1,234.56", "1.2B", "42%" etc. into a number; NaN if non-numeric. */
function parseNumber(value: string): number {
  if (!value) return NaN;
  const cleaned = value.replace(/[$,%\s]/g, '');
  const suffix = /([kmbt])$/i.exec(cleaned);
  const base = parseFloat(cleaned);
  if (isNaN(base)) return NaN;
  if (suffix) {
    const mult = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[suffix[1].toLowerCase()] ?? 1;
    return base * mult;
  }
  return base;
}

function buildChart(headers: string[], rows: string[][]): ChatChart | undefined {
  if (rows.length < 2) return undefined;
  // Label column: first column that is mostly non-numeric.
  let labelCol = -1;
  for (let c = 0; c < headers.length; c++) {
    const numericShare = rows.filter(r => !isNaN(parseNumber(r[c] ?? ''))).length / rows.length;
    if (numericShare < 0.5) {
      labelCol = c;
      break;
    }
  }
  if (labelCol === -1) labelCol = 0;

  // Value column: first numeric column that isn't the label column.
  let valueCol = -1;
  for (let c = 0; c < headers.length; c++) {
    if (c === labelCol) continue;
    const numericShare = rows.filter(r => !isNaN(parseNumber(r[c] ?? ''))).length / rows.length;
    if (numericShare >= 0.5) {
      valueCol = c;
      break;
    }
  }
  if (valueCol === -1) return undefined;

  const points = rows
    .map(r => ({ label: r[labelCol] ?? '', value: parseNumber(r[valueCol] ?? '') }))
    .filter(p => !isNaN(p.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);
  if (points.length < 2) return undefined;

  return {
    type: 'bar',
    labels: points.map(p => p.label),
    values: points.map(p => p.value),
    valueLabel: headers[valueCol] || 'Value',
  };
}

export function formatAgentReply(text: string): FormattedReply {
  const lines = (text ?? '').split('\n');
  const proseLines: string[] = [];
  const tables: ChatTable[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Mermaid pie block:  ```mermaid \n pie showData \n title ... \n "label" : value ...
    const fence = /^\s*```(\w+)?\s*$/.exec(line);
    if (fence) {
      // Collect the fenced block.
      const blockLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !/^\s*```\s*$/.test(lines[j])) {
        blockLines.push(lines[j]);
        j++;
      }
      const isPie = blockLines.some(l => /^\s*pie\b/.test(l));
      if (isPie) {
        let title = '';
        const labels: string[] = [];
        const values: number[] = [];
        for (const bl of blockLines) {
          const titleMatch = /^\s*title\s+(.*)$/.exec(bl);
          if (titleMatch) { title = titleMatch[1].trim(); continue; }
          const slice = /^\s*"([^"]+)"\s*:\s*([\d.,]+)/.exec(bl);
          if (slice) {
            labels.push(slice[1]);
            values.push(parseNumber(slice[2]));
          }
        }
        if (labels.length >= 2) {
          const points = labels
            .map((label, k) => ({ label, value: values[k] }))
            .filter(p => !isNaN(p.value))
            .sort((a, b) => b.value - a.value)
            .slice(0, 12);
          const headers = ['Category', 'Value'];
          const rows = points.map(p => [p.label, p.value.toLocaleString()]);
          tables.push({
            title: title || 'Distribution',
            headers,
            rows,
            chart: { type: 'pie', labels: points.map(p => p.label), values: points.map(p => p.value), valueLabel: title || 'Value' },
          });
          i = j; // skip past the closing fence
          continue;
        }
      }
      // Non-pie fenced block: keep its inner lines as prose (code).
      i = j;
      for (const bl of blockLines) proseLines.push(bl);
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const headers = splitCells(line);
      const rows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length && isTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
        rows.push(splitCells(lines[i]));
        i++;
      }
      i--; // step back; outer loop will advance
      const width = headers.length;
      const norm = rows.map(r => {
        const copy = r.slice(0, width);
        while (copy.length < width) copy.push('');
        return copy;
      });
      tables.push({ headers, rows: norm, chart: buildChart(headers, norm) });
    } else {
      proseLines.push(line);
    }
  }

  return { html: proseToHtml(proseLines), tables };
}
