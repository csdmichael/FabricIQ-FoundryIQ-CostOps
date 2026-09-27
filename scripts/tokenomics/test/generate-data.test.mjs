import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generateDataset } from '../generate-data.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(resolve(testDirectory, '..', '..', '..', 'config', 'deployment.json'), 'utf8'));

test('generates deterministic provider-balanced token consumption without PII', () => {
  const first = generateDataset(config);
  const second = generateDataset(config);
  const settings = config.tokenomicsPlatform.syntheticData;
  const expectedSourceCounts = Object.fromEntries(settings.sourceCodes.map((sourceCode, index) => [
    sourceCode,
    Math.floor((settings.recordCount + settings.sourceCodes.length - 1 - index) / settings.sourceCodes.length),
  ]));

  assert.equal(first.events.length, settings.recordCount);
  assert.equal(first.references.entity_assignment_history.length, settings.userCount);
  assert.equal(new Set(first.references.entity_assignment_history.map(row => row.user_id_hash)).size, settings.userCount);
  assert.deepEqual(first.manifest.source_counts, expectedSourceCounts);
  assert.deepEqual(first.events[0], second.events[0]);
  assert.deepEqual(first.events.at(-1), second.events.at(-1));
  assert.equal(new Set(first.events.map(event => event.id)).size, settings.recordCount);
  assert.ok(first.events.some(event => event.is_anomaly_seed));
  assert.ok(first.events.every(event => event.reported_cost_usd >= 0 && event.total_tokens === event.input_tokens + event.output_tokens));
  assert.ok(first.events.every(event => event.request_count >= Math.floor(settings.requestsPerRecord * 0.5)));
  assert.ok(first.events.reduce((total, event) => total + event.request_count, 0) > 10_000_000);
  assert.ok(first.events.reduce((total, event) => total + event.total_tokens, 0) > 50_000_000_000);
  assert.equal(first.manifest.request_count, first.events.reduce((total, event) => total + event.request_count, 0));
  assert.equal(first.manifest.total_tokens, first.events.reduce((total, event) => total + event.total_tokens, 0));
  assert.match(first.manifest.event_set_sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.manifest.event_set_sha256, second.manifest.event_set_sha256);
  assert.ok(first.events.every(event => !('market_cost_usd' in event) && !('negotiated_cost_usd' in event)));
  assert.ok(first.events.every(event => /^[a-f0-9]{32}$/.test(event.user_id_hash)));
  assert.ok(first.events.every(event => !('user_name' in event) && !('prompt_text' in event)));
  assert.equal(first.manifest.contains_pii, false);
});

test('generates governed dimensions needed by every ML use case', () => {
  const dataset = generateDataset(config);
  const required = ['entity_assignment_history', 'budget_plan', 'model_benchmark', 'business_outcome', 'release_calendar', 'quota_policy', 'capacity_metric', 'model_price_snapshot', 'model_price_history'];
  const flagshipProject = config.tokenomicsPlatform.syntheticData.enterprise?.flagshipProject ?? 'project-falcon';
  assert.deepEqual(Object.keys(dataset.references), required);
  assert.equal(dataset.references.entity_assignment_history.length, config.tokenomicsPlatform.syntheticData.userCount);
  assert.ok(dataset.references.budget_plan.some(row => row.project_id === flagshipProject));
  assert.ok(dataset.references.model_benchmark.every(row => row.quality_score > 0 && row.input_cost_per_million >= 0));
  assert.ok(dataset.references.capacity_metric.every(row => row.metric_value <= row.capacity_limit));
  assert.ok(dataset.references.model_price_history.every(row => row.negotiated_input_usd_per_million < row.market_input_usd_per_million));
});

test('generates auditable nonoverlapping price history for deterministic as-of enrichment', () => {
  const first = generateDataset(config);
  const second = generateDataset(config);
  const snapshots = first.references.model_price_snapshot;
  const history = first.references.model_price_history;

  assert.deepEqual(snapshots, second.references.model_price_snapshot);
  assert.deepEqual(history, second.references.model_price_history);
  assert.ok(snapshots.length > 0);
  assert.ok(snapshots.every(row => row.snapshot_id && row.observed_at && row.source_uri && row.source_payload_sha256));
  assert.ok(snapshots.every(row => ['catalog_api', 'published_price'].includes(row.source_type)));
  assert.ok(snapshots.some(row => row.source_type === 'catalog_api'));

  const byModel = Map.groupBy(history, row => [row.source_code, row.model_name, row.model_version].join('|'));
  for (const periods of byModel.values()) {
    assert.equal(periods.length, 3);
    const ordered = periods.toSorted((left, right) => left.effective_from.localeCompare(right.effective_from));
    assert.equal(ordered[0].effective_to, ordered[1].effective_from);
    assert.equal(ordered[1].effective_to, ordered[2].effective_from);
    assert.equal(ordered[2].effective_to, null);
    assert.ok(ordered[0].market_input_usd_per_million > ordered[2].market_input_usd_per_million);
  }

  for (const event of first.events) {
    const matches = history.filter(rate =>
      rate.source_code === event.source_code
      && rate.model_name === event.model_name
      && rate.model_version === event.model_version
      && event.event_ts >= rate.effective_from
      && (rate.effective_to === null || event.event_ts < rate.effective_to));
    assert.equal(matches.length, 1);
  }
});
