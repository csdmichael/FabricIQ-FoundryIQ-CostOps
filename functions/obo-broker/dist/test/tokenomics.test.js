import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrokerError } from '../src/errors.js';
import { buildTokenomicsDashboard, rowsFromTables, tokenomicsDashboardQuery, tokenomicsWindow } from '../src/tokenomics.js';
const config = {
    tokenomicsCurrency: 'USD',
    tokenomicsRateCard: [{
            model: 'gpt-4o-mini',
            effectiveFrom: '2025-01-01T00:00:00Z',
            marketInputUsdPerMillion: 1,
            marketOutputUsdPerMillion: 4,
            negotiatedInputUsdPerMillion: 0.8,
            negotiatedOutputUsdPerMillion: 3.2,
        }],
};
test('maps Azure Monitor columns and prices complete model usage', () => {
    const table = {
        name: 'PrimaryResult',
        columnDescriptors: [
            { name: 'Section', type: 'string' },
            { name: 'Requests', type: 'long' },
            { name: 'Successes', type: 'long' },
            { name: 'Errors', type: 'long' },
            { name: 'TokenizedRequests', type: 'long' },
            { name: 'PromptTokens', type: 'long' },
            { name: 'CompletionTokens', type: 'long' },
            { name: 'TotalTokens', type: 'long' },
            { name: 'P95LatencyMs', type: 'real' },
            { name: 'Model', type: 'string' },
            { name: 'TimeBucket', type: 'string' },
            { name: 'ApplicationId', type: 'string' },
        ],
        rows: [
            ['summary', 10, 9, 1, 8, 1_000_000, 250_000, 1_250_000, 420, '', '', ''],
            ['model', 8, 0, 0, 8, 1_000_000, 250_000, 1_250_000, 0, 'gpt-4o-mini', '2026-09-01', ''],
            ['allocation', 10, 9, 1, 8, 1_000_000, 250_000, 1_250_000, 420, 'gpt-4o-mini', '2026-09-01', 'client-a'],
        ],
    };
    const dashboard = buildTokenomicsDashboard(rowsFromTables([table]), config, 30, 'complete');
    assert.equal(dashboard.summary.marketCost, 2);
    assert.equal(dashboard.summary.negotiatedCost, 1.6);
    assert.equal(dashboard.summary.savings, 0.4);
    assert.equal(dashboard.summary.tokenCoveragePct, 80);
    assert.equal(dashboard.dataQuality.pricing, 'negotiated');
    assert.equal(dashboard.dataQuality.allocation, 'attributed');
});
test('rejects arbitrary dashboard windows', () => {
    assert.equal(tokenomicsWindow(null), 30);
    assert.equal(tokenomicsWindow('7'), 7);
    assert.throws(() => tokenomicsWindow('365'), (error) => error instanceof BrokerError && error.code === 'invalid_window');
});
test('correlates token rows only to configured gateway requests', () => {
    const query = tokenomicsDashboardQuery({
        tokenomicsApiIds: ['fabric-lakehouse-obo', 'fabric-data-agent-obo'],
        tokenomicsProjectId: 'parts',
        tokenomicsTeamId: 'planning',
        tokenomicsCostCenter: 'cc-205',
    });
    assert.match(query, /let ApiIds = dynamic\(\["fabric-lakehouse-obo","fabric-data-agent-obo"\]\)/);
    assert.match(query, /Tokens\s+\| join kind=inner \(Requests/);
    assert.doesNotMatch(query, /Tokens\s+\| join kind=leftouter \(Requests/);
});
//# sourceMappingURL=tokenomics.test.js.map