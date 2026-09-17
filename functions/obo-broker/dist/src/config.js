const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sqlHostPattern = /^[a-z0-9-]+\.datawarehouse\.fabric\.microsoft\.com$/i;
export function loadConfig(environment) {
    const required = (name) => {
        const value = environment[name]?.trim();
        if (!value)
            throw new Error(`Missing ${name}`);
        return value;
    };
    const positiveInteger = (name) => {
        const value = Number(required(name));
        if (!Number.isSafeInteger(value) || value < 1)
            throw new Error(`Invalid ${name}`);
        return value;
    };
    const uuidList = (name) => {
        const values = required(name).split(',').map(value => value.trim()).filter(Boolean);
        if (!values.length || values.some(value => !uuidPattern.test(value)))
            throw new Error(`Invalid ${name}`);
        return [...new Set(values.map(value => value.toLowerCase()))];
    };
    const dimension = (name) => {
        const value = required(name);
        if (!/^[A-Za-z0-9._-]{1,64}$/.test(value))
            throw new Error(`Invalid ${name}`);
        return value;
    };
    const tokenomicsApiIds = required('TOKENOMICS_APIM_API_IDS').split(',').map(value => value.trim()).filter(Boolean);
    if (!tokenomicsApiIds.length || tokenomicsApiIds.some(value => !/^[A-Za-z0-9._-]{1,128}$/.test(value))) {
        throw new Error('Invalid TOKENOMICS_APIM_API_IDS');
    }
    let tokenomicsRateCard;
    try {
        const parsed = JSON.parse(required('TOKENOMICS_RATE_CARD_JSON'));
        if (!Array.isArray(parsed))
            throw new Error();
        tokenomicsRateCard = parsed;
    }
    catch {
        throw new Error('Invalid TOKENOMICS_RATE_CARD_JSON');
    }
    const validRate = (rate) => typeof rate === 'object' && rate !== null
        && typeof rate.model === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(rate.model)
        && typeof rate.effectiveFrom === 'string' && !Number.isNaN(Date.parse(rate.effectiveFrom))
        && (rate.effectiveTo === undefined || (typeof rate.effectiveTo === 'string' && !Number.isNaN(Date.parse(rate.effectiveTo))))
        && [rate.marketInputUsdPerMillion, rate.marketOutputUsdPerMillion].every(value => Number.isFinite(value) && value >= 0)
        && [rate.negotiatedInputUsdPerMillion, rate.negotiatedOutputUsdPerMillion].every(value => value === undefined || (Number.isFinite(value) && value >= 0));
    if (!tokenomicsRateCard.every(validRate))
        throw new Error('Invalid TOKENOMICS_RATE_CARD_JSON');
    const config = {
        resourceTenantId: required('RESOURCE_TENANT_ID').toLowerCase(),
        callerTenantId: required('CALLER_TENANT_ID').toLowerCase(),
        apiClientId: required('ENTRA_API_CLIENT_ID').toLowerCase(),
        apiClientSecret: required('OBO_CLIENT_SECRET'),
        brokerAudience: required('BROKER_AUDIENCE').toLowerCase(),
        brokerRole: required('BROKER_APPLICATION_ROLE'),
        apimPrincipalId: required('APIM_PRINCIPAL_ID').toLowerCase(),
        connectorClientIds: uuidList('ALLOWED_CONNECTOR_CLIENT_IDS'),
        allowedUserObjectIds: uuidList('ALLOWED_USER_OBJECT_IDS'),
        delegatedScope: required('DELEGATED_SCOPE'),
        fabricApiScope: required('FABRIC_API_SCOPE'),
        powerBiApiScope: required('POWER_BI_API_SCOPE'),
        workspaceId: required('FABRIC_WORKSPACE_ID').toLowerCase(),
        lakehouseName: required('FABRIC_LAKEHOUSE_NAME'),
        sqlEndpointHost: required('FABRIC_SQL_ENDPOINT_HOST').toLowerCase(),
        dataAgentId: required('FABRIC_DATA_AGENT_ID').toLowerCase(),
        jwkFetchTimeoutMs: positiveInteger('JWK_FETCH_TIMEOUT_MS'),
        tokenExchangeTimeoutMs: positiveInteger('TOKEN_EXCHANGE_TIMEOUT_MS'),
        sqlConnectTimeoutMs: positiveInteger('SQL_CONNECT_TIMEOUT_MS'),
        sqlRequestTimeoutMs: positiveInteger('SQL_REQUEST_TIMEOUT_MS'),
        maxRows: positiveInteger('MAX_ROWS'),
        maxStatementLength: positiveInteger('MAX_STATEMENT_LENGTH'),
        managedIdentityClientId: required('MANAGED_IDENTITY_CLIENT_ID').toLowerCase(),
        logAnalyticsWorkspaceId: required('LOG_ANALYTICS_WORKSPACE_ID').toLowerCase(),
        tokenomicsApiIds,
        tokenomicsProjectId: dimension('TOKENOMICS_PROJECT_ID'),
        tokenomicsTeamId: dimension('TOKENOMICS_TEAM_ID'),
        tokenomicsCostCenter: dimension('TOKENOMICS_COST_CENTER'),
        tokenomicsCurrency: required('TOKENOMICS_CURRENCY').toUpperCase(),
        tokenomicsRateCard,
    };
    const uuidValues = [config.resourceTenantId, config.callerTenantId, config.apiClientId,
        config.brokerAudience, config.apimPrincipalId, config.workspaceId, config.dataAgentId,
        config.managedIdentityClientId, config.logAnalyticsWorkspaceId];
    if (uuidValues.some(value => !uuidPattern.test(value))
        || !sqlHostPattern.test(config.sqlEndpointHost)
        || config.fabricApiScope !== 'https://api.fabric.microsoft.com/.default'
        || config.powerBiApiScope !== 'https://analysis.windows.net/powerbi/api/.default'
        || !/^[A-Z]{3}$/.test(config.tokenomicsCurrency)
        || config.lakehouseName.length > 128 || /[\r\n]/.test(config.lakehouseName)
        || config.maxRows > 10000 || config.maxStatementLength > 100000) {
        throw new Error('Invalid broker configuration');
    }
    return config;
}
export function downstreamScope(config, target) {
    if (target === 'fabric')
        return config.fabricApiScope;
    if (target === 'powerbi')
        return config.powerBiApiScope;
    throw new Error('Unsupported downstream target');
}
export function dataAgentMcpUrl(config) {
    return `https://api.fabric.microsoft.com/v1/mcp/workspaces/${config.workspaceId}/dataagents/${config.dataAgentId}/agent`;
}
//# sourceMappingURL=config.js.map