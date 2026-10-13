import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generatePowerBiArtifacts } from '../generate-powerbi.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(resolve(testDirectory, '..', '..', '..', 'config', 'deployment.json'), 'utf8'));
const semanticModelId = '11111111-1111-4111-8111-111111111111';
const metadata = {
  workspaceId: '22222222-2222-4222-8222-222222222222',
  lakehouseId: '33333333-3333-4333-8333-333333333333',
  sqlEndpointId: '44444444-4444-4444-8444-444444444444',
  sqlEndpointConnectionString: 'tokenomics-test.datawarehouse.fabric.microsoft.com',
};

function decodePart(definition, path) {
  const part = definition.parts.find(candidate => candidate.path === path);
  assert.ok(part, `Missing definition part '${path}'.`);
  return JSON.parse(Buffer.from(part.payload, 'base64').toString('utf8'));
}

test('generates a semantic model over all shared and ML output tables', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const model = decodePart(artifacts.semanticModel, 'model.bim');
  const tables = model.model.tables;
  const useCases = config.tokenomicsPlatform.fabric.mlUseCases;

  assert.equal(artifacts.semanticModel.format, 'TMSL');
  assert.equal(tables.length, 17);
  assert.equal(artifacts.manifest.requiredTables.length, 17);
  assert.equal(artifacts.manifest.tableContracts.length, 17);
  assert.equal(new Set(artifacts.manifest.requiredTables).size, 17);
  assert.ok(artifacts.manifest.tableContracts.every(contract => contract.columns.length > 0));
  assert.deepEqual(artifacts.manifest.mlUseCases.map(useCase => useCase.key), useCases.map(useCase => useCase.key));

  const usage = tables.find(table => table.name === 'Usage');
  assert.ok(usage);
  const usageColumnNames = new Set(usage.columns.map(column => column.name));
  for (const dimension of config.tokenomicsPlatform.fabric.reportDimensions) {
    assert.ok(usageColumnNames.has(dimension), `Usage table is missing '${dimension}'.`);
  }
  for (const measure of ['Total Tokens', 'Market Cost', 'Negotiated Cost', 'Actual Cost', 'Potential Savings', 'Active Users']) {
    assert.ok(usage.measures.some(candidate => candidate.name === measure), `Usage table is missing measure '${measure}'.`);
  }

  for (const useCase of artifacts.manifest.mlUseCases) {
    const table = tables.find(candidate => candidate.name === useCase.semanticTable);
    assert.ok(table, `Missing semantic table '${useCase.semanticTable}'.`);
    assert.ok(JSON.stringify(table.partitions).includes(`[ml].[${useCase.outputTable.split('.')[1]}]`));
    assert.ok(table.measures.some(candidate => candidate.name.endsWith('Estimated Savings')));
  }
});

test('generates consumption and cost pages with every requested slicing dimension', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const binding = decodePart(artifacts.consumptionReport, 'definition.pbir');
  const report = decodePart(artifacts.consumptionReport, 'report.json');
  const serialized = JSON.stringify(report);

  assert.deepEqual(Object.keys(artifacts.consumptionReport).sort(), ['format', 'parts']);
  assert.equal(artifacts.consumptionReport.format, 'PBIR-Legacy');
  assert.equal(binding.datasetReference.byConnection.connectionString, `semanticmodelid=${semanticModelId}`);
  assert.deepEqual(report.sections.map(section => section.displayName), [
    'Executive Overview',
    'Consumption by User',
    'Consumption by Provider',
    'Usage and Cost Explorer',
    'Chargeback and Allocation',
    'Model Economics',
    'Copilot Studio & Azure Foundry',
  ]);

  const expectedDrilldowns = new Map([
    ['Consumption by User', ['user_id_hash', 'model_family', 'source_code', 'model_name', 'model_version']],
    ['Consumption by Provider', ['source_code', 'service_code', 'model_family', 'model_name', 'model_version', 'user_id_hash']],
  ]);
  for (const [pageName, expectedRows] of expectedDrilldowns) {
    const page = report.sections.find(section => section.displayName === pageName);
    const visuals = page.visualContainers.map(container => JSON.parse(container.config).singleVisual);
    const matrix = visuals.find(visual => visual.visualType === 'pivotTable');
    assert.ok(matrix, `${pageName} is missing its drilldown matrix.`);
    assert.deepEqual(matrix.projections.Rows.map(row => row.queryRef), expectedRows.map(row => `Usage.${row}`));
    assert.deepEqual(matrix.projections.Values.map(value => value.queryRef), [
      'Usage.Total Tokens',
      'Usage.Reported Cost',
      'Usage.Market Cost',
      'Usage.Negotiated Cost',
    ]);
  }
  for (const dimension of config.tokenomicsPlatform.fabric.reportDimensions) {
    assert.ok(serialized.includes(`Usage.${dimension}`), `Consumption report is missing '${dimension}'.`);
  }
  for (const measure of ['Usage.Total Tokens', 'Usage.Reported Cost', 'Usage.Market Cost', 'Usage.Negotiated Cost']) {
    assert.ok(serialized.includes(measure), `Consumption report is missing '${measure}'.`);
  }
});

test('generates a portfolio page, one page per ML algorithm, and governance', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const binding = decodePart(artifacts.mlReport, 'definition.pbir');
  const report = decodePart(artifacts.mlReport, 'report.json');
  const pageNames = report.sections.map(section => section.displayName);
  const serialized = JSON.stringify(report);

  assert.deepEqual(Object.keys(artifacts.mlReport).sort(), ['format', 'parts']);
  assert.equal(artifacts.mlReport.format, 'PBIR-Legacy');
  assert.equal(binding.datasetReference.byConnection.connectionString, `semanticmodelid=${semanticModelId}`);
  assert.equal(pageNames.length, 14);
  assert.equal(pageNames[0], 'ML Portfolio Overview');
  assert.equal(pageNames.at(-1), 'Model Governance');
  for (const useCase of artifacts.manifest.mlUseCases) {
    assert.ok(pageNames.includes(useCase.reportPage), `Missing report page '${useCase.reportPage}'.`);
    assert.ok(serialized.includes(useCase.semanticTable), `Report does not query '${useCase.semanticTable}'.`);
  }
  assert.deepEqual(artifacts.manifest.dashboards.map(dashboard => dashboard.name), [
    'Tokenomics FinOps Executive Dashboard',
    'Tokenomics ML Operations Dashboard',
  ]);
});

test('adds Copilot Studio credit fields, measures, and the AI credit rate card to the semantic model', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const model = decodePart(artifacts.semanticModel, 'model.bim');
  const usage = model.model.tables.find(table => table.name === 'Usage');
  const rateCard = model.model.tables.find(table => table.name === 'AI Credit Price History');
  const columnNamed = (table, name) => table.columns.find(candidate => candidate.name === name);
  const measureNamed = (table, name) => table.measures.find(candidate => candidate.name === name);

  for (const name of ['service_code', 'consumption_unit', 'agent_id', 'ai_credits', 'credit_unit_price_usd']) {
    assert.ok(columnNamed(usage, name), `Usage table is missing column '${name}'.`);
  }
  assert.equal(columnNamed(usage, 'credit_unit_price_usd').formatString, '$#,##0.0000');

  assert.ok(rateCard, 'Semantic model is missing the AI Credit Price History table.');
  assert.match(JSON.stringify(rateCard.partitions), /\[ml\]\.\[ai_credit_price_history\]/);
  for (const name of ['service_code', 'effective_from', 'effective_to', 'is_current', 'market_usd_per_credit', 'negotiated_usd_per_credit', 'prepaid_pack_credits', 'prepaid_pack_price_usd', 'prepaid_effective_usd_per_credit', 'source_name']) {
    assert.ok(columnNamed(rateCard, name), `AI Credit Price History is missing '${name}'.`);
  }

  assert.equal(measureNamed(usage, 'AI Credits').expression, "SUM('Usage'[ai_credits])");
  assert.equal(measureNamed(usage, 'Copilot Studio Cost').expression, 'CALCULATE([Market Cost], \'Usage\'[service_code] = "copilot-studio")');
  assert.equal(measureNamed(usage, 'Copilot Studio Negotiated Cost').expression, 'CALCULATE([Negotiated Cost], \'Usage\'[service_code] = "copilot-studio")');
  assert.equal(measureNamed(usage, 'Azure AI Foundry Cost').expression, 'CALCULATE([Market Cost], \'Usage\'[service_code] = "azure-ai-foundry")');
  assert.equal(measureNamed(usage, 'Effective USD per AI Credit').expression, 'DIVIDE(CALCULATE([Reported Cost], \'Usage\'[service_code] = "copilot-studio"), [AI Credits])');
  assert.equal(measureNamed(usage, 'Effective USD per AI Credit').formatString, '$#,##0.0000');

  const priceContract = artifacts.manifest.tableContracts.find(contract => contract.semanticTable === 'AI Credit Price History');
  assert.equal(priceContract.qualifiedName, 'ml.ai_credit_price_history');
  assert.ok(artifacts.manifest.requiredTables.includes(priceContract.qualifiedName));
  const usageContract = artifacts.manifest.tableContracts.find(contract => contract.semanticTable === 'Usage');
  assert.ok(usageContract.columns.includes('agent_id'));
  assert.ok(usageContract.columns.includes('ai_credits'));
});

test('generates a Copilot Studio and Azure Foundry page with AI credit economics and the rate card', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const report = decodePart(artifacts.consumptionReport, 'report.json');
  const page = report.sections.find(section => section.displayName === 'Copilot Studio & Azure Foundry');
  assert.ok(page, 'Missing the Copilot Studio & Azure Foundry page.');
  const visuals = page.visualContainers.map(container => JSON.parse(container.config).singleVisual);
  const cardMeasures = visuals.filter(visual => visual.visualType === 'card').map(visual => visual.projections.Values[0].queryRef);
  const charts = visuals
    .filter(visual => visual.visualType.endsWith('Chart'))
    .map(visual => [visual.visualType, visual.projections.Category[0].queryRef, visual.projections.Y.map(value => value.queryRef)]);
  const rateCard = visuals.find(visual => visual.visualType === 'tableEx');

  assert.deepEqual(cardMeasures, [
    'Usage.AI Credits',
    'Usage.Copilot Studio Cost',
    'Usage.Copilot Studio Negotiated Cost',
    'Usage.Azure AI Foundry Cost',
    'Usage.Effective USD per AI Credit',
  ]);
  assert.deepEqual(charts, [
    ['clusteredBarChart', 'Usage.agent_id', ['Usage.Copilot Studio Cost']],
    ['clusteredBarChart', 'Usage.model_name', ['Usage.Copilot Studio AI Credits']],
    ['lineChart', 'Usage.usage_date', ['Usage.Copilot Studio AI Credits']],
    ['lineChart', 'Usage.usage_date', ['Usage.Copilot Studio Cost', 'Usage.Azure AI Foundry Cost']],
  ]);
  assert.equal(rateCard.prototypeQuery.From[0].Entity, 'AI Credit Price History');
  assert.deepEqual(rateCard.projections.Values.map(value => value.queryRef.replace('AI Credit Price History.', '')), [
    'service_code',
    'effective_from',
    'effective_to',
    'is_current',
    'market_usd_per_credit',
    'negotiated_usd_per_credit',
    'prepaid_pack_credits',
    'prepaid_pack_price_usd',
    'prepaid_effective_usd_per_credit',
    'source_name',
  ]);
});

test('adds Copilot Studio and Azure AI Foundry tiles to the executive overview that the dashboard pins from', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const report = decodePart(artifacts.consumptionReport, 'report.json');
  const executive = report.sections.find(section => section.displayName === 'Executive Overview');
  const tiles = executive.visualContainers
    .map(container => JSON.parse(container.config).singleVisual)
    .filter(visual => visual.visualType === 'card')
    .map(visual => visual.projections.Values[0].queryRef);

  assert.ok(tiles.includes('Usage.Copilot Studio Cost'));
  assert.ok(tiles.includes('Usage.Azure AI Foundry Cost'));
  assert.equal(artifacts.manifest.dashboards[0].sourcePage, 'Executive Overview');
});

test('slices the explorer by every configured dimension, including service and consumption unit', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const report = decodePart(artifacts.consumptionReport, 'report.json');
  const explorer = report.sections.find(section => section.displayName === 'Usage and Cost Explorer');
  const slicers = explorer.visualContainers
    .map(container => JSON.parse(container.config).singleVisual)
    .filter(visual => visual.visualType === 'slicer')
    .map(visual => visual.projections.Values[0].queryRef);

  assert.deepEqual(slicers, config.tokenomicsPlatform.fabric.reportDimensions.map(dimension => `Usage.${dimension}`));
});

test('keeps visuals inside each page without overlap and bound to existing semantic model fields', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const model = decodePart(artifacts.semanticModel, 'model.bim');
  const tables = new Map(model.model.tables.map(table => [table.name, table]));

  for (const definition of [artifacts.consumptionReport, artifacts.mlReport]) {
    const report = decodePart(definition, 'report.json');
    for (const section of report.sections) {
      const containers = section.visualContainers;
      for (const container of containers) {
        assert.ok(
          container.x >= 0 && container.y >= 0 && container.x + container.width <= section.width && container.y + container.height <= section.height,
          `'${section.displayName}' places a visual outside the ${section.width}x${section.height} page.`,
        );
      }
      containers.forEach((current, index) => {
        for (const other of containers.slice(index + 1)) {
          const overlaps = current.x < other.x + other.width && other.x < current.x + current.width
            && current.y < other.y + other.height && other.y < current.y + current.height;
          assert.ok(!overlaps, `'${section.displayName}' has overlapping visuals at (${current.x}, ${current.y}) and (${other.x}, ${other.y}).`);
        }
      });
      for (const container of containers) {
        const visual = JSON.parse(container.config).singleVisual;
        const entity = visual.prototypeQuery.From[0].Entity;
        const table = tables.get(entity);
        assert.ok(table, `'${section.displayName}' queries missing table '${entity}'.`);
        const columns = new Set(table.columns.map(column => column.name));
        const measures = new Set(table.measures.map(measure => measure.name));
        for (const item of visual.prototypeQuery.Select) {
          if (item.Column) assert.ok(columns.has(item.Column.Property), `'${section.displayName}' references missing column '${entity}.${item.Column.Property}'.`);
          if (item.Measure) assert.ok(measures.has(item.Measure.Property), `'${section.displayName}' references missing measure '${entity}.${item.Measure.Property}'.`);
        }
      }
    }
  }
});

test('keeps manifest page names, table counts, and reporting dimensions aligned with the generated definitions', () => {
  const artifacts = generatePowerBiArtifacts(config, metadata, semanticModelId);
  const model = decodePart(artifacts.semanticModel, 'model.bim');
  const consumption = decodePart(artifacts.consumptionReport, 'report.json');
  const ml = decodePart(artifacts.mlReport, 'report.json');

  assert.deepEqual(artifacts.manifest.reports[0].pageNames, consumption.sections.map(section => section.displayName));
  assert.deepEqual(artifacts.manifest.reports[1].pageNames, ml.sections.map(section => section.displayName));
  assert.equal(artifacts.manifest.semanticModel.tableCount, model.model.tables.length);
  assert.deepEqual(artifacts.manifest.reportDimensions, config.tokenomicsPlatform.fabric.reportDimensions);
});

