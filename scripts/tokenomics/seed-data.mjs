import { CosmosClient } from '@azure/cosmos';
import { ManagedIdentityCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDataset } from './generate-data.mjs';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function jsonLines(rows) {
  return Buffer.from(`${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8');
}

async function retry(label, action) {
  let lastError;
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      const statusCode = Number(error.statusCode ?? error.code ?? 0);
      if (![0, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504].includes(statusCode) || attempt === 18) {
        throw error;
      }
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5000));
    }
  }
  throw new Error(`${label} failed: ${lastError?.message ?? 'unknown error'}`);
}

async function uploadBlob(container, name, content, metadata) {
  const blob = container.getBlockBlobClient(name);
  await retry(`upload ${name}`, () => blob.uploadData(content, {
    blobHTTPHeaders: { blobContentType: name.endsWith('.json') ? 'application/json' : 'application/x-ndjson' },
    metadata,
    overwrite: true,
  }));
}

async function executeBulkWithRetry(items, operations, label) {
  let pending = operations;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const results = await retry(label, () => items.executeBulkOperations(pending));
    const retryable = [];
    const terminal = [];
    results.forEach((result, index) => {
      if (result.statusCode >= 200 && result.statusCode < 300) {
        return;
      }
      if ([408, 429, 500, 502, 503, 504].includes(result.statusCode)) {
        retryable.push(pending[index]);
      } else {
        terminal.push(result);
      }
    });
    if (terminal.length > 0) {
      throw new Error(`${label} returned ${terminal.length} non-retryable failed operation(s).`);
    }
    if (retryable.length === 0) {
      return;
    }
    if (attempt === 12) {
      throw new Error(`${label} still has ${retryable.length} failed operation(s) after retries.`);
    }
    pending = retryable;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 5000));
  }
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
  for (let offset = 0; offset < dataset.events.length; offset += 100) {
    const operations = dataset.events.slice(offset, offset + 100).map(item => ({
      operationType: 'Upsert',
      partitionKey: item.source_code,
      resourceBody: item,
    }));
    await executeBulkWithRetry(items, operations, `Cosmos bulk ${offset}`);
  }

  const container = cosmos.database(platform.cosmos.databaseName).container(platform.cosmos.containerName);
  const verification = {};
  for (const sourceCode of platform.syntheticData.sourceCodes) {
    const query = {
      query: 'SELECT VALUE COUNT(1) FROM c WHERE c.source_code = @sourceCode',
      parameters: [{ name: '@sourceCode', value: sourceCode }],
    };
    const response = await retry(`verify ${sourceCode}`, () => container.items.query(query, { partitionKey: sourceCode }).fetchAll());
    verification[sourceCode] = Number(response.resources[0]);
    if (verification[sourceCode] !== dataset.manifest.source_counts[sourceCode]) {
      throw new Error(`Cosmos verification mismatch for ${sourceCode}.`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    recordCount: dataset.events.length,
    sourceCounts: verification,
    rawPrefix: `${platform.rawStorage.containerName}/${platform.rawStorage.prefix}`,
    cosmosDatabase: platform.cosmos.databaseName,
    cosmosContainer: platform.cosmos.containerName,
  })}\n`);
}

await main();
