import { normalizeAzureRetailPrices, parseProviderPricingMarkdown } from './model-pricing.js';
function assertSourceUrl(value, host) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== host)
        throw new Error(`invalid_pricing_source_${host}`);
    return url;
}
async function fetchResponse(url) {
    const response = await fetch(url, {
        headers: { Accept: 'text/markdown, application/json;q=0.9' },
        signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok)
        throw new Error(`pricing_source_${response.status}`);
    return response;
}
export function createModelPriceSource() {
    return {
        async fetchText(url) {
            const response = await fetchResponse(url);
            const content = await response.text();
            if (content.length > 2_000_000)
                throw new Error('pricing_source_too_large');
            return content;
        },
        async fetchAzurePrices(url) {
            const items = [];
            let nextUrl = url;
            for (let page = 0; nextUrl && page < 100; page += 1) {
                assertSourceUrl(nextUrl, 'prices.azure.com');
                const payload = await (await fetchResponse(nextUrl)).json();
                if (!Array.isArray(payload.Items))
                    throw new Error('invalid_azure_pricing_payload');
                items.push(...payload.Items);
                nextUrl = payload.NextPageLink ?? null;
            }
            if (nextUrl)
                throw new Error('azure_pricing_page_limit_exceeded');
            return items;
        },
    };
}
export async function refreshModelPrices(settings, store, source = createModelPriceSource(), capturedAt = new Date()) {
    assertSourceUrl(settings.openAiUrl, 'developers.openai.com');
    assertSourceUrl(settings.anthropicUrl, 'platform.claude.com');
    assertSourceUrl(settings.azureRetailUrl, 'prices.azure.com');
    const [openAiMarkdown, anthropicMarkdown, azureItems] = await Promise.all([
        source.fetchText(settings.openAiUrl),
        source.fetchText(settings.anthropicUrl),
        source.fetchAzurePrices(settings.azureRetailUrl),
    ]);
    const records = [
        ...parseProviderPricingMarkdown('openai', openAiMarkdown, settings.openAiUrl, capturedAt),
        ...parseProviderPricingMarkdown('anthropic', anthropicMarkdown, settings.anthropicUrl, capturedAt),
        ...normalizeAzureRetailPrices(azureItems, settings.azureRetailUrl, capturedAt),
    ];
    const providerCounts = {
        anthropic: records.filter(record => record.provider === 'anthropic').length,
        openai: records.filter(record => record.provider === 'openai').length,
        azure: records.filter(record => record.provider === 'azure').length,
    };
    if (Object.values(providerCounts).some(count => count === 0))
        throw new Error('pricing_source_empty');
    const snapshotDate = capturedAt.toISOString().slice(0, 10);
    await store.replaceSnapshot(snapshotDate, capturedAt.toISOString(), records);
    return { snapshotDate, capturedAt: capturedAt.toISOString(), totalRecords: records.length, providerCounts };
}
//# sourceMappingURL=model-price-service.js.map