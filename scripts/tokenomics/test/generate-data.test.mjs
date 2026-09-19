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

  assert.equal(first.events.length, settings.recordCount);
  assert.equal(new Set(first.events.map(event => event.user_id_hash)).size, settings.userCount);
  assert.deepEqual(first.manifest.source_counts, { aws: 3000, gcp: 3000, oai: 3000, cld: 3000 });
  assert.deepEqual(first.events[0], second.events[0]);
  assert.deepEqual(first.events.at(-1), second.events.at(-1));
  assert.equal(new Set(first.events.map(event => event.id)).size, settings.recordCount);
  assert.ok(first.events.some(event => event.is_anomaly_seed));
  assert.ok(first.events.every(event => event.source_cost >= 0 && event.total_tokens === event.input_tokens + event.output_tokens));
  assert.ok(first.events.every(event => /^[a-f0-9]{32}$/.test(event.user_id_hash)));
  assert.ok(first.events.every(event => !('user_name' in event) && !('prompt_text' in event)));
  assert.equal(first.manifest.contains_pii, false);
});

test('generates governed dimensions needed by every ML use case', () => {
  const dataset = generateDataset(config);
  const required = ['entity_assignment_history', 'budget_plan', 'model_benchmark', 'business_outcome', 'release_calendar', 'quota_policy', 'capacity_metric', 'model_rate_card'];
  assert.deepEqual(Object.keys(dataset.references), required);
  assert.equal(dataset.references.entity_assignment_history.length, config.tokenomicsPlatform.syntheticData.userCount);
  assert.ok(dataset.references.budget_plan.some(row => row.project_id === 'project-falcon'));
  assert.ok(dataset.references.model_benchmark.every(row => row.quality_score > 0 && row.input_cost_per_million >= 0));
  assert.ok(dataset.references.capacity_metric.every(row => row.metric_value <= row.capacity_limit));
  assert.ok(dataset.references.model_rate_card.every(row => row.negotiated_input_usd_per_million < row.market_input_usd_per_million));
});
