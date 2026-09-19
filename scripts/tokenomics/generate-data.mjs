import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_CATALOG = {
  aws: [
    { family: 'Amazon Nova', name: 'amazon.nova-pro-v1', version: '1.0', input: 0.80, cached: 0.20, output: 3.20, context: 300000 },
    { family: 'Claude', name: 'anthropic.claude-3-7-sonnet', version: '20250219-v1', input: 3.00, cached: 0.30, output: 15.00, context: 200000 },
    { family: 'Llama', name: 'meta.llama3-3-70b-instruct', version: '1.0', input: 0.72, cached: 0.18, output: 0.72, context: 128000 },
  ],
  gcp: [
    { family: 'Gemini', name: 'gemini-2.5-pro', version: '002', input: 1.25, cached: 0.31, output: 10.00, context: 1048576 },
    { family: 'Gemini', name: 'gemini-2.5-flash', version: '002', input: 0.30, cached: 0.08, output: 2.50, context: 1048576 },
    { family: 'Claude', name: 'claude-3-5-sonnet-v2', version: '20241022', input: 3.00, cached: 0.30, output: 15.00, context: 200000 },
  ],
  oai: [
    { family: 'GPT-5', name: 'gpt-5', version: '2025-08-07', input: 1.25, cached: 0.13, output: 10.00, context: 400000 },
    { family: 'GPT-4.1', name: 'gpt-4.1', version: '2025-04-14', input: 2.00, cached: 0.50, output: 8.00, context: 1047576 },
    { family: 'GPT-4.1', name: 'gpt-4.1-mini', version: '2025-04-14', input: 0.40, cached: 0.10, output: 1.60, context: 1047576 },
    { family: 'o-series', name: 'o4-mini', version: '2025-04-16', input: 1.10, cached: 0.28, output: 4.40, context: 200000 },
  ],
  cld: [
    { family: 'Claude 4', name: 'claude-opus-4-1', version: '20250805', input: 15.00, cached: 1.50, output: 75.00, context: 200000 },
    { family: 'Claude 4', name: 'claude-sonnet-4', version: '20250514', input: 3.00, cached: 0.30, output: 15.00, context: 200000 },
    { family: 'Claude 3.5', name: 'claude-3-5-haiku', version: '20241022', input: 0.80, cached: 0.08, output: 4.00, context: 200000 },
  ],
};

const PERSONAS = ['casual_user', 'heavy_researcher', 'agent_builder', 'developer', 'executive_user'];
const TASK_TYPES = ['summarization', 'research', 'code_generation', 'agent_orchestration', 'document_analysis', 'customer_support'];
const ENVIRONMENTS = ['dev', 'test', 'prod'];
const DEPARTMENTS = ['engineering', 'research', 'finance', 'sales', 'support', 'operations', 'legal', 'marketing'];
const BUSINESS_UNITS = ['products', 'services', 'corporate', 'field'];

function randomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function integer(random, minimum, maximum) {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function round(value, precision = 6) {
  return Number(value.toFixed(precision));
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

function createUsers(count, random) {
  return Array.from({ length: count }, (_, index) => {
    const persona = PERSONAS[index % PERSONAS.length];
    const projectNumber = (index % 40) + 1;
    return {
      user_id_hash: hash(`tokenomics-user-${String(index + 1).padStart(5, '0')}`),
      persona,
      team_id: `team-${String((index % 30) + 1).padStart(2, '0')}`,
      department_id: DEPARTMENTS[index % DEPARTMENTS.length],
      business_unit_id: BUSINESS_UNITS[index % BUSINESS_UNITS.length],
      cost_center_id: `cc-${String((index % 20) + 100).padStart(3, '0')}`,
      project_id: projectNumber === 1 ? 'project-falcon' : `project-${String(projectNumber).padStart(2, '0')}`,
      application_id: `app-${String((index % 50) + 1).padStart(3, '0')}`,
      environment: index % 10 < 6 ? 'prod' : pick(random, ENVIRONMENTS.slice(0, 2)),
    };
  });
}

function tokenProfile(persona) {
  switch (persona) {
    case 'heavy_researcher': return { input: 9000, output: 3000, calls: 5 };
    case 'agent_builder': return { input: 6500, output: 2200, calls: 8 };
    case 'developer': return { input: 4500, output: 1800, calls: 3 };
    case 'executive_user': return { input: 2600, output: 900, calls: 1 };
    default: return { input: 1100, output: 450, calls: 0 };
  }
}

export function generateDataset(config) {
  const settings = config.tokenomicsPlatform.syntheticData;
  const random = randomFactory(Number(settings.randomSeed));
  const endExclusive = new Date(`${settings.endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const start = new Date(endExclusive.getTime() - Number(settings.lookbackDays) * 86400000);
  const users = createUsers(Number(settings.userCount), random);
  const events = [];

  for (let index = 0; index < Number(settings.recordCount); index += 1) {
    const sourceCode = settings.sourceCodes[index % settings.sourceCodes.length];
    const model = pick(random, MODEL_CATALOG[sourceCode]);
    const user = pick(random, users);
    const taskType = pick(random, TASK_TYPES);
    const profile = tokenProfile(user.persona);
    const anomaly = random() < 0.018;
    const multiplier = anomaly ? integer(random, 5, 14) : 1;
    const inputTokens = integer(random, Math.floor(profile.input * 0.25), Math.floor(profile.input * 1.8)) * multiplier;
    const outputTokens = integer(random, Math.floor(profile.output * 0.2), Math.floor(profile.output * 1.5)) * multiplier;
    const cacheRatio = Math.min(0.85, Math.max(0, random() * 0.75 - (taskType === 'agent_orchestration' ? 0.08 : 0)));
    const cachedInputTokens = Math.floor(inputTokens * cacheRatio);
    const cacheWriteTokens = Math.floor(inputTokens * random() * 0.08);
    const retryCount = random() < 0.09 ? integer(random, 1, 3) : 0;
    const failed = random() < 0.035;
    const toolCallCount = Math.max(0, integer(random, 0, profile.calls));
    const toolSuccessCount = Math.max(0, toolCallCount - (random() < 0.08 ? 1 : 0));
    const eventTime = new Date(start.getTime() + Math.floor(random() * (endExclusive.getTime() - start.getTime())));
    const billableInput = inputTokens - cachedInputTokens;
    const sourceCost = ((billableInput * model.input) + (cachedInputTokens * model.cached) + (outputTokens * model.output)) / 1000000;
    const taskCompleted = failed ? 0 : 1;
    const taskId = `task-${String(index + 1).padStart(7, '0')}`;

    events.push({
      id: `${sourceCode}-${hash(`${settings.randomSeed}-${index}`).slice(0, 24)}`,
      event_id: `${sourceCode}-evt-${String(index + 1).padStart(8, '0')}`,
      event_ts: eventTime.toISOString(),
      usage_date: isoDate(eventTime),
      ingested_at: endExclusive.toISOString(),
      source_code: sourceCode,
      account_id: `${sourceCode}-account-${String((index % 8) + 1).padStart(2, '0')}`,
      region: pick(random, sourceCode === 'gcp' ? ['us-central1', 'us-east4', 'europe-west4'] : ['westus2', 'eastus2', 'westeurope']),
      request_id: hash(`request-${settings.randomSeed}-${index}`),
      correlation_id: hash(`correlation-${settings.randomSeed}-${Math.floor(index / 3)}`),
      model_family: model.family,
      model_name: model.name,
      model_version: model.version,
      deployment_id: `${sourceCode}-${model.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      user_id_hash: user.user_id_hash,
      team_id: user.team_id,
      department_id: user.department_id,
      business_unit_id: user.business_unit_id,
      cost_center_id: user.cost_center_id,
      project_id: user.project_id,
      application_id: user.application_id,
      agent_id: user.persona === 'agent_builder' || random() < 0.22 ? `agent-${String((index % 24) + 1).padStart(2, '0')}` : null,
      environment: user.environment,
      task_id: taskId,
      task_type: taskType,
      prompt_template_id: `prompt-${taskType}-${String((index % 12) + 1).padStart(2, '0')}`,
      request_count: 1,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      cache_write_tokens: cacheWriteTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      context_window_tokens: Math.min(model.context, inputTokens + outputTokens + integer(random, 0, 5000)),
      tool_call_count: toolCallCount,
      tool_success_count: toolSuccessCount,
      retry_count: retryCount,
      failure_count: failed ? 1 : 0,
      latency_ms: integer(random, 180, 4500) * (retryCount + 1) * multiplier,
      status_code: failed ? pick(random, [429, 500, 503]) : 200,
      is_stream: random() < 0.62,
      currency: 'USD',
      source_cost: round(sourceCost, 8),
      tasks_completed: taskCompleted,
      hours_saved: taskCompleted ? round(integer(random, 2, 90) / 60, 3) : 0,
      tickets_reduced: taskType === 'customer_support' && taskCompleted ? integer(random, 0, 3) : 0,
      code_generated_lines: taskType === 'code_generation' && taskCompleted ? integer(random, 10, 900) : 0,
      quality_score: failed ? 0 : round(0.68 + random() * 0.31, 4),
      prompt_char_count: integer(random, 180, 16000) * multiplier,
      is_anomaly_seed: anomaly,
    });
  }

  const assignmentHistory = users.map(user => ({
    ...user,
    effective_from: isoDate(start),
    effective_to: null,
    is_current: true,
  }));
  const projectIds = [...new Set(users.map(user => user.project_id))];
  const budgetPlan = projectIds.flatMap(projectId => Array.from({ length: 9 }, (_, monthOffset) => {
    const month = new Date(Date.UTC(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth() - 5 + monthOffset, 1));
    return {
      project_id: projectId,
      fiscal_month: isoDate(month).slice(0, 7),
      budget_usd: round(integer(random, 3500, 30000), 2),
      approved_tpm: integer(random, 25000, 300000),
      approved_rpm: integer(random, 100, 3000),
    };
  }));
  const modelBenchmarks = Object.entries(MODEL_CATALOG).flatMap(([sourceCode, models]) =>
    models.flatMap(model => TASK_TYPES.map(taskType => ({
      source_code: sourceCode,
      model_family: model.family,
      model_name: model.name,
      model_version: model.version,
      task_type: taskType,
      quality_score: round(0.72 + random() * 0.27, 4),
      input_cost_per_million: model.input,
      cached_input_cost_per_million: model.cached,
      output_cost_per_million: model.output,
      context_window_tokens: model.context,
      approved_for_production: random() > 0.08,
    }))),
  );
  const businessOutcomes = events.filter((_, index) => index % 6 === 0).map(event => ({
    task_id: event.task_id,
    usage_date: event.usage_date,
    project_id: event.project_id,
    application_id: event.application_id,
    outcome_type: pick(random, ['document_completed', 'ticket_resolved', 'analysis_delivered', 'code_change_accepted']),
    outcome_count: event.tasks_completed,
    estimated_business_value_usd: event.tasks_completed ? round(integer(random, 5, 180), 2) : 0,
  }));
  const releaseCalendar = projectIds.flatMap((projectId, index) => [0, 1, 2].map(offset => {
    const releaseDate = new Date(Date.UTC(endExclusive.getUTCFullYear(), endExclusive.getUTCMonth() + offset, 1 + (index % 20)));
    return {
      project_id: projectId,
      release_date: isoDate(releaseDate),
      expected_usage_multiplier: round(1.1 + random() * 1.4, 3),
      release_type: pick(random, ['feature', 'agent_launch', 'regional_rollout', 'model_upgrade']),
    };
  }));
  const quotaPolicies = projectIds.flatMap(projectId => settings.sourceCodes.map(sourceCode => ({
    project_id: projectId,
    source_code: sourceCode,
    current_tpm: integer(random, 25000, 250000),
    current_rpm: integer(random, 100, 2500),
    minimum_headroom_pct: integer(random, 15, 35),
  })));
  const capacityMetrics = Array.from({ length: 1200 }, (_, index) => {
    const eventTime = new Date(start.getTime() + Math.floor((index / 1200) * (endExclusive.getTime() - start.getTime())));
    const metric = pick(random, ['apim_requests_per_minute', 'foundry_tokens_per_minute', 'ai_search_units', 'model_quota_units']);
    const capacity = metric === 'ai_search_units' ? 12 : metric === 'model_quota_units' ? 1000 : 300000;
    return {
      event_ts: eventTime.toISOString(),
      service: metric.split('_')[0],
      region: pick(random, ['westus', 'westus2', 'eastus2']),
      metric_name: metric,
      metric_value: round(capacity * (0.25 + random() * 0.72), 3),
      capacity_limit: capacity,
      unit: metric.includes('tokens') ? 'tokens_per_minute' : metric.includes('requests') ? 'requests_per_minute' : 'count',
    };
  });

  const modelRateCard = Object.entries(MODEL_CATALOG).flatMap(([sourceCode, models]) => models.map(model => ({
    source_code: sourceCode,
    model_family: model.family,
    model_name: model.name,
    model_version: model.version,
    effective_from: isoDate(start),
    effective_to: null,
    currency: 'USD',
    market_input_usd_per_million: model.input,
    market_cached_input_usd_per_million: model.cached,
    market_cache_write_usd_per_million: round(model.input * 1.25, 6),
    market_output_usd_per_million: model.output,
    negotiated_input_usd_per_million: round(model.input * 0.88, 6),
    negotiated_cached_input_usd_per_million: round(model.cached * 0.88, 6),
    negotiated_cache_write_usd_per_million: round(model.input * 1.1, 6),
    negotiated_output_usd_per_million: round(model.output * 0.88, 6),
  })));

  return {
    events,
    references: {
      entity_assignment_history: assignmentHistory,
      budget_plan: budgetPlan,
      model_benchmark: modelBenchmarks,
      business_outcome: businessOutcomes,
      release_calendar: releaseCalendar,
      quota_policy: quotaPolicies,
      capacity_metric: capacityMetrics,
      model_rate_card: modelRateCard,
    },
    manifest: {
      schema_version: 1,
      generated_at: endExclusive.toISOString(),
      random_seed: Number(settings.randomSeed),
      record_count: events.length,
      user_count: users.length,
      source_counts: Object.fromEntries(settings.sourceCodes.map(code => [code, events.filter(event => event.source_code === code).length])),
      contains_pii: false,
    },
  };
}

async function writeJsonLines(path, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

export async function writeDataset(dataset, outputDirectory) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  for (const sourceCode of Object.keys(MODEL_CATALOG)) {
    await writeJsonLines(join(outputDirectory, 'consumption', sourceCode, 'token_consumption.jsonl'), dataset.events.filter(event => event.source_code === sourceCode));
  }
  await writeJsonLines(join(outputDirectory, 'cosmos', 'token_consumption.jsonl'), dataset.events);
  for (const [name, rows] of Object.entries(dataset.references)) {
    await writeJsonLines(join(outputDirectory, 'reference', `${name}.jsonl`), rows);
  }
  await writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(dataset.manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, '..', '..');
  const configIndex = process.argv.indexOf('--config');
  const outputIndex = process.argv.indexOf('--output');
  const configPath = resolve(configIndex >= 0 ? process.argv[configIndex + 1] : join(repositoryRoot, 'config', 'deployment.json'));
  const outputPath = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : join(repositoryRoot, '.generated', 'tokenomics', 'seed'));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const dataset = generateDataset(config);
  await writeDataset(dataset, outputPath);
  process.stdout.write(`${JSON.stringify({ outputPath, ...dataset.manifest })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
