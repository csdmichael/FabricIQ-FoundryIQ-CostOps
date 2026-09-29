import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('browser');
const port = process.env.PORT || 8080;
const apimHost = process.env.APIM_GATEWAY_HOST;
const tokenomicsApiPath = (process.env.APIM_TOKENOMICS_API_PATH || '').trim().replace(/^\/+|\/+$/g, '');
const proxyPrefix = tokenomicsApiPath ? `/api/${tokenomicsApiPath}` : '';
const runtimeConfig = {
  apiBaseUrl: proxyPrefix,
  tenantId: process.env.RUNTIME_CONFIG_TENANT_ID || '',
  clientId: process.env.RUNTIME_CONFIG_CLIENT_ID || '',
  scope: process.env.RUNTIME_CONFIG_SCOPE || '',
  environment: process.env.RUNTIME_CONFIG_ENVIRONMENT || 'Enterprise',
  powerBiScope: 'https://analysis.windows.net/powerbi/api/.default',
};
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

const ALLOWED_ROUTES = [
  { method: 'GET', pattern: /^\/summary\/?$/ },
  { method: 'GET', pattern: /^\/pricing\/?$/ },
  { method: 'GET', pattern: /^\/pricing\/consumption\/?$/ },
  { method: 'GET', pattern: /^\/actions\/?$/ },
  { method: 'GET', pattern: /^\/prompts\/?$/ },
  { method: 'GET', pattern: /^\/powerbi\/embed\/?$/ },
  { method: 'GET', pattern: /^\/health\/?$/ },
  { method: 'POST', pattern: /^\/chat\/?$/ },
  { method: 'POST', pattern: /^\/showcase\/visits\/?$/, public: true },
  { method: 'GET', pattern: /^\/showcase\/visits\/?$/ },
];

function proxy(request, response, url) {
  if (!apimHost) return sendJson(response, 503, { error: 'gateway_not_configured' });
  const suffix = url.pathname.slice(proxyPrefix.length);
  const route = ALLOWED_ROUTES.find(route => route.method === request.method && route.pattern.test(suffix));
  if (!route) return sendJson(response, 404, { error: 'not_found' });
  const authorization = request.headers.authorization;
  if (!route.public && !authorization?.startsWith('Bearer ')) return sendJson(response, 401, { error: 'authorization_required' });
  const headers = { Accept: 'application/json' };
  if (authorization?.startsWith('Bearer ')) headers.Authorization = authorization;
  if (route.public) {
    const forwarded = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '');
    headers['X-Showcase-Client-IP'] = forwarded.split(',')[0].trim().replace(/^::ffff:/, '');
  }
  if (request.method === 'POST' && request.headers['content-type']) {
    headers['Content-Type'] = request.headers['content-type'];
  }
  const upstream = httpsRequest({
    hostname: apimHost,
    method: request.method,
    path: `/${tokenomicsApiPath}${suffix}${url.search}`,
    headers,
    timeout: 190_000,
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 502, {
      'Content-Type': upstreamResponse.headers['content-type'] || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    });
    upstreamResponse.pipe(response);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('upstream_timeout')));
  upstream.on('error', () => sendJson(response, 502, { error: 'gateway_unavailable' }));
  if (request.method === 'POST') {
    request.pipe(upstream);
  } else {
    upstream.end();
  }
}

function staticFile(request, response, url) {
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  let file = resolve(join(root, relative || 'index.html'));
  if (!file.startsWith(root)) return sendJson(response, 400, { error: 'invalid_path' });
  let stats;
  try {
    stats = statSync(file);
    if (stats.isDirectory()) {
      file = join(file, 'index.html');
      stats = statSync(file);
    }
  } catch {
    file = join(root, 'index.html');
    stats = statSync(file);
  }
  const extension = extname(file).toLowerCase();
  const immutable = /-[A-Z0-9]{8,}\.(?:css|js)$/i.test(file);
  const headers = {
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://caldova-fabric-tokenomics-api.azurewebsites.net https://login.microsoftonline.com https://api.fabric.microsoft.com https://api.powerbi.com https://*.powerbi.com; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-src 'self' https://app.powerbi.com https://login.microsoftonline.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.microsoftonline.com",
    'Referrer-Policy': 'no-referrer',
  };
  const rangeMatch = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = stats.size - 1;
  let status = 200;

  if (request.headers.range) {
    if (!rangeMatch || (!rangeMatch[1] && !rangeMatch[2])) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` });
      return response.end();
    }
    if (!rangeMatch[1]) {
      const suffixLength = Number(rangeMatch[2]);
      start = Math.max(stats.size - suffixLength, 0);
    } else {
      start = Number(rangeMatch[1]);
      if (rangeMatch[2]) end = Math.min(Number(rangeMatch[2]), end);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stats.size) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` });
      return response.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;
  }

  headers['Content-Length'] = String(end - start + 1);
  response.writeHead(status, headers);
  if (request.method === 'HEAD') return response.end();
  createReadStream(file, { start, end }).on('error', () => response.destroy()).pipe(response);
}

createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
    if (url.pathname === '/runtime-config.json') return sendJson(response, 200, runtimeConfig);
    if (url.pathname.startsWith('/api/')) {
      if (!proxyPrefix) return sendJson(response, 503, { error: 'gateway_not_configured' });
      if (!url.pathname.startsWith(proxyPrefix)) return sendJson(response, 404, { error: 'not_found' });
      return proxy(request, response, url);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'method_not_allowed' });
    return staticFile(request, response, url);
  } catch {
    if (response.headersSent) return response.destroy();
    return sendJson(response, 400, { error: 'invalid_url' });
  }
}).listen(port);