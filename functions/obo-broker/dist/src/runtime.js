import { createHash } from 'node:crypto';
import { createTokenVerifier } from './auth.js';
import { loadConfig } from './config.js';
import { BrokerError } from './errors.js';
import { createDataAgentClient } from './mcp.js';
import { createTokenExchanger } from './obo.js';
import { assertReadOnlyStatement, executeQuery, tableListStatement } from './sql.js';
import { createTokenomicsQuery } from './tokenomics.js';
export function createRuntime(config = loadConfig(process.env)) {
    const verify = createTokenVerifier(config);
    const exchange = createTokenExchanger(config);
    const askDataAgent = createDataAgentClient(config);
    const tokenomics = createTokenomicsQuery(config);
    return {
        config,
        async authorize(request) {
            const assertion = request.headers.get('x-user-assertion') ?? '';
            const identity = await verify(request.headers.get('authorization') ?? '', assertion);
            return { assertion, ...identity };
        },
        exchange,
        query: (token, statement) => executeQuery(config, token, assertReadOnlyStatement(statement, config.maxStatementLength)),
        askDataAgent,
        tokenomics,
    };
}
let singleton;
export function runtime() {
    singleton ??= createRuntime();
    return singleton;
}
export function audit(context, route, status, metadata = {}) {
    const userIdHash = metadata.objectId
        ? createHash('sha256').update(metadata.objectId.toLowerCase()).digest('hex').slice(0, 24)
        : null;
    context.log(JSON.stringify({
        event: 'fabric_obo_request', route, status,
        invocationId: context.invocationId,
        correlationId: metadata.correlationId ?? context.invocationId,
        userIdHash,
        applicationId: metadata.applicationId ?? null,
        projectId: metadata.projectId ?? 'unassigned',
        teamId: metadata.teamId ?? 'unassigned',
        costCenter: metadata.costCenter ?? 'unassigned',
    }));
}
export function statementFromBody(body) {
    if (!body || typeof body !== 'object' || typeof body.statement !== 'string') {
        throw new BrokerError(400, 'invalid_request');
    }
    return body.statement;
}
export function questionFromBody(body) {
    if (!body || typeof body !== 'object' || typeof body.question !== 'string') {
        throw new BrokerError(400, 'invalid_request');
    }
    const question = body.question.trim();
    if (!question || question.length > 4000 || /[\0\r]/.test(question))
        throw new BrokerError(400, 'invalid_request');
    return question;
}
export { tableListStatement };
//# sourceMappingURL=runtime.js.map