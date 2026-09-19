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
  assert.equal(tables.length, 16);
  assert.equal(artifacts.manifest.requiredTables.length, 16);
  assert.equal(artifacts.manifest.tableContracts.length, 16);
  assert.equal(new Set(artifacts.manifest.requiredTables).size, 16);
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
    'Usage and Cost Explorer',
    'Chargeback and Allocation',
    'Model Economics',
  ]);
  for (const dimension of config.tokenomicsPlatform.fabric.reportDimensions) {
    assert.ok(serialized.includes(`Usage.${dimension}`), `Consumption report is missing '${dimension}'.`);
  }
  for (const measure of ['Usage.Total Tokens', 'Usage.Reported Cost', 'Usage.Market Cost', 'Usage.Negotiated Cost', 'Usage.Actual Cost']) {
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