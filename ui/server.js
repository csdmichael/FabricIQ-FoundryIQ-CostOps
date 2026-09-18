import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve('browser');
const port = Number(process.env.PORT || 8080);
const apimHost = process.env.APIM_GATEWAY_HOST;
const tokenomicsApiPath = (process.env.APIM_TOKENOMICS_API_PATH || '').trim().replace(/^\/+|\/+$/g, '');
const proxyPrefix = tokenomicsApiPath ? `/api/${tokenomicsApiPath}` : '';
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function proxy(request, response, url) {
  if (!apimHost || request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' });
  const suffix = url.pathname.slice(proxyPrefix.length);
  if (!/^\/summary\/?$/.test(suffix)) return sendJson(response, 404, { error: 'not_found' });
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return sendJson(response, 401, { error: 'authorization_required' });
  const upstream = httpsRequest({
    hostname: apimHost,
    method: 'GET',
    path: `/${tokenomicsApiPath}${suffix}${url.search}`,
    headers: { Authorization: authorization, Accept: 'application/json' },
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
  upstream.end();
}

function staticFile(request, response, url) {
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  let file = resolve(join(root, relative || 'index.html'));
  if (!file.startsWith(root)) return sendJson(response, 400, { error: 'invalid_path' });
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(root, 'index.html');
  }
  const extension = extname(file).toLowerCase();
  const immutable = /-[A-Z0-9]{8,}\.(?:css|js)$/i.test(file);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://login.microsoftonline.com; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://login.microsoftonline.com",
    'Referrer-Policy': 'no-referrer',
  });
  createReadStream(file).on('error', () => response.destroy()).pipe(response);
}

createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/health') return sendJson(response, 200, { status: 'ok' });
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
}).listen(port, '0.0.0.0');