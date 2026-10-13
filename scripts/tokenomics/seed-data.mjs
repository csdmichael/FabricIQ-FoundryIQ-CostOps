import { CosmosClient } from '@azure/cosmos';
import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDataset } from './generate-data.mjs';
import { eventSetFingerprint } from './generate-data.mjs';
import { executeBulkWithRetry, retry } from './cosmos-bulk.mjs';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function jsonLines(rows) {
  return Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

async function uploadBlob(container, name, content, metadata) {
  const blob = container.getBlockBlobClient(name);
  await retry(`upload ${name}`, () => blob.uploadData(content, {
    blobHTTPHeaders: { blobContentType: name.endsWith('.json') ? 'application/json' : 'application/x-ndjson' },
    metadata,
    overwrite: true,
  }));
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, '..', '..');
  const configPath = resolve(argument('--config', resolve(repositoryRoot, 'config', 'deployment.json')));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const platform = config.tokenomicsPlatform;
  const dataset = generateDataset(config);
  const credential = new ManagedIdentityCredential();

  const blobService = new BlobServiceClient(`https://${platform.rawStorage.accountName}.blob.core.windows.net`, credential);
  const rawContainer = blobService.getContainerClient(platform.rawStorage.containerName);
  const metadata = { schema_version: '1', contains_pii: 'false', random_seed: String(dataset.manifest.random_seed) };
  for (const sourceCode of platform.syntheticData.sourceCodes) {
    const rows = dataset.events.filter(event => event.source_code === sourceCode);
    await uploadBlob(rawContainer, `${platform.rawStorage.prefix}/consumption/${sourceCode}/token_consumption.jsonl`, jsonLines(rows), { ...metadata, source_code: sourceCode });
  }
  for (const [name, rows] of Object.entries(dataset.references)) {
    await uploadBlob(rawContainer, `${platform.rawStorage.prefix}/reference/${name}.jsonl`, jsonLines(rows), { ...metadata, dataset: name });
  }
  await uploadBlob(rawContainer, `${platform.rawStorage.prefix}/manifest.json`, Buffer.from(`${JSON.stringify(dataset.manifest, null, 2)}\n`, 'utf8'), metadata);

  const cosmos = new CosmosClient({
    endpoint: `https://${platform.cosmos.accountName}.documents.azure.com:443/`,
    aadCredentials: credential,
    connectionPolicy: { requestTimeout: 120000, enableEndpointDiscovery: true },
  });
  const items = cosmos.database(platform.cosmos.databaseName).container(platform.cosmos.containerName).items;
  const desiredKeys = new Set(dataset.events.map(event => `${event.source_code}\0${event.id}`));
  const existingResponse = await retry('list existing Cosmos seed rows', () => items.query({
    query: 'SELECT c.id, c.source_code FROM c',
  }).fetchAll());
  const staleByPartition = Map.groupBy(
    existingResponse.resources.filter(item => !desiredKeys.has(`${item.source_code}\0${item.id}`)),
    item => item.source_code,
  );
  for (const [sourceCode, staleItems] of staleByPartition) {
    for (let offset = 0; offset < staleItems.length; offset += 100) {
      const operations = staleItems.slice(offset, offset + 100).map(item => ({
        operationType: 'Delete',
        partitionKey: sourceCode,
        id: item.id,
      }));
      await executeBulkWithRetry(items, operations, `Cosmos stale-row cleanup ${sourceCode} ${offset}`);
    }
  }
  for (let offset = 0; offset < dataset.events.length; offset += 100) {
    const operations = dataset.events.slice(offset, offset + 100).map(item => ({
      operationType: 'Upsert',
      partitionKey: item.source_code,
      resourceBody: item,
    }));
    await executeBulkWithRetry(items, operations, `Cosmos bulk ${offset}`);
  }

  const container = cosmos.database(platform.cosmos.databaseName).container(platform.cosmos.containerName);
  const verificationResponse = await retry('verify complete Cosmos seed', () => container.items.query({
    query: 'SELECT * FROM c',
  }).fetchAll());
  const cosmosEvents = verificationResponse.resources.map(item => Object.fromEntries(
    Object.entries(item).filter(([name]) => !name.startsWith('_')),
  ));
  if (cosmosEvents.length !== dataset.events.length) {
    throw new Error(`Cosmos verification expected ${dataset.events.length} total rows but found ${cosmosEvents.length}.`);
  }
  const verification = Object.fromEntries(platform.syntheticData.sourceCodes.map(sourceCode => [
    sourceCode,
    cosmosEvents.filter(event => event.source_code === sourceCode).length,
  ]));
  for (const sourceCode of platform.syntheticData.sourceCodes) {
    if (verification[sourceCode] !== dataset.manifest.source_counts[sourceCode]) {
      throw new Error(`Cosmos verification mismatch for ${sourceCode}.`);
    }
  }
  const cosmosFingerprint = eventSetFingerprint(cosmosEvents);
  if (cosmosFingerprint !== dataset.manifest.event_set_sha256) {
    throw new Error('Cosmos verification fingerprint does not match the generated event set.');
  }

  process.stdout.write(`${JSON.stringify({
    recordCount: dataset.events.length,
    requestCount: dataset.manifest.request_count,
    totalTokens: dataset.manifest.total_tokens,
    eventSetSha256: cosmosFingerprint,
    sourceCounts: verification,
    rawPrefix: `${platform.rawStorage.containerName}/${platform.rawStorage.prefix}`,
    cosmosDatabase: platform.cosmos.databaseName,
    cosmosContainer: platform.cosmos.containerName,
  })}\n`);
}

await main();
