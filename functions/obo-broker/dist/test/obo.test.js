import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrokerError } from '../src/errors.js';
import { createTokenExchanger } from '../src/obo.js';
const config = {
    fabricApiScope: 'https://api.fabric.microsoft.com/.default',
    powerBiApiScope: 'https://analysis.windows.net/powerbi/api/.default',
    tokenExchangeTimeoutMs: 1000,
};
test('requests only the configured downstream resource and caps token lifetime', async () => {
    const scopes = [];
    const client = {
        async acquireTokenOnBehalfOf(request) {
            scopes.push(request.scopes);
            assert.equal(request.oboAssertion, 'user-assertion');
            assert.equal(request.skipCache, true);
            return { accessToken: 'downstream-token', expiresOn: new Date(Date.now() + 300000) };
        },
    };
    const exchange = createTokenExchanger(config, client);
    const userExpiry = Math.ceil(Date.now() / 1000) + 120;
    const fabric = await exchange('user-assertion', 'fabric', userExpiry);
    const powerBi = await exchange('user-assertion', 'powerbi', userExpiry);
    assert.deepEqual(scopes, [[config.fabricApiScope], [config.powerBiApiScope]]);
    assert.equal(fabric.accessToken, 'downstream-token');
    assert.ok(fabric.expiresIn <= 120 && powerBi.expiresIn <= 120);
});
test('fails closed when Entra rejects OBO or returns no token', async () => {
    for (const result of [null, { accessToken: '' }]) {
        const client = { acquireTokenOnBehalfOf: async () => result };
        await assert.rejects(createTokenExchanger(config, client)('assertion', 'fabric', Math.ceil(Date.now() / 1000) + 300), (error) => error instanceof BrokerError && [403, 502].includes(error.status));
    }
});
test('logs only sanitized Entra diagnostics when OBO is rejected', async () => {
    const messages = [];
    const originalWarn = console.warn;
    console.warn = message => messages.push(String(message));
    try {
        const client = {
            async acquireTokenOnBehalfOf() {
                throw {
                    errorCode: 'invalid_grant',
                    subError: 'consent_required',
                    correlationId: '01234567-89ab-4cde-8fab-0123456789ab',
                    errorMessage: 'must-not-be-logged secret-value',
                };
            },
        };
        await assert.rejects(createTokenExchanger(config, client)('assertion', 'fabric', Math.ceil(Date.now() / 1000) + 300), (error) => error instanceof BrokerError && error.code === 'exchange_rejected');
    }
    finally {
        console.warn = originalWarn;
    }
    assert.equal(messages.length, 1);
    assert.deepEqual(JSON.parse(messages[0]), {
        event: 'fabric_obo_exchange_rejected',
        errorCode: 'invalid_grant',
        subError: 'consent_required',
        correlationId: '01234567-89ab-4cde-8fab-0123456789ab',
    });
    assert.doesNotMatch(messages[0], /secret-value/);
});
//# sourceMappingURL=obo.test.js.map