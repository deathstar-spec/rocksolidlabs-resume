import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { sanitize } from './sanitize.mjs';

export const FRESH_MS = 60_000;
export const MAX_STALE_MS = 300_000; // Total age since the last successful sanitized snapshot.
export const RETRY_MS = 10_000;
export const TIMEOUT_MS = 5_000;
export const MAX_BYTES = 1_048_576; // Per decoded upstream response, including streamed bodies.
const UNAVAILABLE = JSON.stringify({ error: 'Monitoring data unavailable' });

export function upstreamUrls(origin) {
  let base;
  try { base = new URL(origin); } catch { throw new Error('Invalid monitoring origin'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Invalid monitoring origin');
  }
  // Paths and status-page slug cannot be chosen by a visitor or a request header.
  return [
    new URL('/api/status-page/rock-solid-labs', base).href,
    new URL('/api/status-page/heartbeat/rock-solid-labs', base).href
  ];
}

export async function fetchJson(url, {
  fetchImpl = fetch, timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let reader;
  try {
    response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', credentials: 'omit',
      headers: { Accept: 'application/json' }, signal: controller.signal
    });
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      throw new Error('Unavailable upstream');
    }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
      throw new Error('Unavailable upstream');
    }
    if (!response.body) throw new Error('Unavailable upstream');
    reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Unavailable upstream');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } catch {
    // Neither errors nor raw payloads are logged, cached or sent to clients.
    controller.abort();
    if (reader) await reader.cancel().catch(() => {});
    else if (response?.body) await response.body.cancel().catch(() => {});
    throw new Error('Unavailable upstream');
  } finally {
    clearTimeout(timeout);
    reader?.releaseLock();
  }
}

export function createSnapshotCache({ origin, fetchImpl = fetch, now = () => performance.now() }) {
  const urls = upstreamUrls(origin);
  let snapshot;
  let savedAt = -Infinity;
  let retryAt = -Infinity;
  let inflight;

  async function refresh() {
    // Wait for both bounded requests before permitting another refresh.
    const results = await Promise.allSettled(urls.map((url) => fetchJson(url, { fetchImpl })));
    if (results.some((result) => result.status !== 'fulfilled')) throw new Error('Unavailable upstream');
    const clean = sanitize(results[0].value, results[1].value);
    // Only serialized, freshly constructed public objects live in the cache.
    snapshot = Object.freeze({ config: JSON.stringify(clean.config), heartbeat: JSON.stringify(clean.heartbeat) });
    savedAt = now();
  }

  return async function getSnapshot() {
    if (snapshot && now() - savedAt < FRESH_MS) return snapshot;
    if (!inflight && now() >= retryAt) {
      inflight = refresh().catch(() => {
        retryAt = now() + RETRY_MS;
      }).finally(() => { inflight = undefined; });
    }
    if (inflight) await inflight;
    if (snapshot && now() - savedAt <= MAX_STALE_MS) return snapshot;
    return null;
  };
}

export function createServer(options) {
  const getSnapshot = createSnapshotCache(options);
  const server = http.createServer({
    requestTimeout: 10_000, headersTimeout: 10_000,
    keepAliveTimeout: 5_000, maxHeaderSize: 8_192
  }, async (request, response) => {
    const reply = (status, body, extra = {}) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        // The bounded server cache is authoritative; do not prolong stale data downstream.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...extra
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    // Drain/discard bodies without buffering or using their contents.
    request.resume();
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(405, JSON.stringify({ error: 'Method not allowed' }), { Allow: 'GET, HEAD', Connection: 'close' });
      return;
    }
    // Query parameters are deliberately ignored. Absolute-form and other paths are not proxies.
    const path = (request.url ?? '').split('?')[0];
    const kind = path === '/api/lab-status/config' ? 'config'
      : path === '/api/lab-status/heartbeat' ? 'heartbeat' : null;
    if (!kind) {
      reply(404, JSON.stringify({ error: 'Not found' }));
      return;
    }
    try {
      const snapshot = await getSnapshot();
      if (!snapshot) reply(503, UNAVAILABLE);
      else reply(200, snapshot[kind]);
    } catch {
      reply(503, UNAVAILABLE);
    }
  });
  // CONNECT is dispatched separately by Node and must never create a tunnel.
  server.on('connect', (_request, socket) => {
    socket.end('HTTP/1.1 405 Method Not Allowed\r\nAllow: GET, HEAD\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = createServer({ origin: process.env.KUMA_ORIGIN });
    server.on('error', () => {
      console.error('Monitoring sanitizer could not start.');
      process.exit(1);
    });
    server.listen(3000, '0.0.0.0');
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  } catch {
    console.error('Monitoring sanitizer configuration is unavailable.');
    process.exit(1);
  }
}
