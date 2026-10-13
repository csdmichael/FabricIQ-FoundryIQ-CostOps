// Retry-aware Cosmos helpers for the Tokenomics seed runner. They live in their own module so tests can import
// them without starting the seed.

export async function retry(label, action) {
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

export async function executeBulkWithRetry(items, operations, label, pauseMilliseconds = 5000) {
  let pending = operations;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const results = await retry(label, () => items.executeBulkOperations(pending));
    const retryable = [];
    const terminal = [];
    results.forEach((result, index) => {
      // Bulk results wrap the HTTP response, so the status code is read from result.response.
      const statusCode = result.response?.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        return;
      }
      if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
        retryable.push(pending[index]);
      } else {
        const operation = pending[index];
        terminal.push({ id: operation.id ?? operation.resourceBody?.id, statusCode });
      }
    });
    if (terminal.length > 0) {
      const sample = terminal.slice(0, 3).map(item => `${item.id} HTTP ${item.statusCode ?? 'none'}`).join(', ');
      throw new Error(`${label} returned ${terminal.length} non-retryable failed operation(s): ${sample}.`);
    }
    if (retryable.length === 0) {
      return;
    }
    if (attempt === 12) {
      throw new Error(`${label} still has ${retryable.length} failed operation(s) after retries.`);
    }
    pending = retryable;
    await new Promise(resolvePromise => setTimeout(resolvePromise, pauseMilliseconds));
  }
}
