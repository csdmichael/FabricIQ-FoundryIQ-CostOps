import assert from 'node:assert/strict';
import test from 'node:test';
import { executeBulkWithRetry } from '../cosmos-bulk.mjs';

const deleteOperation = id => ({ operationType: 'Delete', partitionKey: 'aws', id });

// Each call to executeBulkOperations returns the next scripted batch result.
function scriptedItems(batches) {
  let call = 0;
  return {
    executeBulkOperations: async () => batches[Math.min(call++, batches.length - 1)],
  };
}

test('treats bulk results with a 2xx response status as successful', async () => {
  const operations = [deleteOperation('a'), deleteOperation('b')];
  const items = scriptedItems([[
    { operationInput: operations[0], response: { statusCode: 204 } },
    { operationInput: operations[1], response: { statusCode: 200 } },
  ]]);

  await executeBulkWithRetry(items, operations, 'test cleanup', 0);
});

test('reports non-retryable bulk failures with the document id and HTTP status', async () => {
  const operations = [deleteOperation('missing-doc')];
  const items = scriptedItems([[{ operationInput: operations[0], response: { statusCode: 403 } }]]);

  await assert.rejects(
    () => executeBulkWithRetry(items, operations, 'test cleanup', 0),
    error => /non-retryable failed operation\(s\): missing-doc HTTP 403/.test(error.message),
  );
});

test('retries throttled bulk operations until they succeed', async () => {
  const operations = [deleteOperation('busy')];
  const items = scriptedItems([
    [{ operationInput: operations[0], response: { statusCode: 429 } }],
    [{ operationInput: operations[0], response: { statusCode: 204 } }],
  ]);

  await executeBulkWithRetry(items, operations, 'test cleanup', 0);
});

test('fails loudly when a bulk result carries no response', async () => {
  const operations = [deleteOperation('orphan')];
  const items = scriptedItems([[{ operationInput: operations[0] }]]);

  await assert.rejects(
    () => executeBulkWithRetry(items, operations, 'test cleanup', 0),
    /orphan HTTP none/,
  );
});
