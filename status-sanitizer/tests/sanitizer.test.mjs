import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { APPROVED_GROUPS, sanitize } from '../sanitize.mjs';
import { createServer, createSnapshotCache, fetchJson, upstreamUrls,
  FRESH_MS, MAX_STALE_MS, RETRY_MS } from '../server.mjs';
import { publicGroups, summarizeMonitors } from '../../app/src/lib/monitoring.js';

const origin = 'https://kuma.example.invalid';
const sentinel = 'SYNTHETIC_PRIVATE_SENTINEL';
const sensitive = { url: sentinel, hostname: sentinel, token: sentinel,
  description: sentinel, tags: [sentinel], unknown: sentinel };
function fixture(count = 50) {
  let id = 9000;
  const heartbeatList = {};
  const uptimeList = {};
  const publicGroupList = APPROVED_GROUPS.map((group) => ({
    ...sensitive, id: ++id, name: group.name,
    monitorList: group.monitors.map((monitor) => {
      const rawId = ++id;
      heartbeatList[rawId] = Array.from({ length: count }, (_, index) => ({
        ...sensitive, status: 1, ping: index, time: sentinel, msg: sentinel
      }));
      uptimeList[`${rawId}_24`] = 0.99;
      return { ...sensitive, id: rawId, name: monitor.name, sendUrl: 1, type: sentinel };
    })
  }));
  return { config: { ...sensitive, config: sensitive, incident: sensitive,
    maintenanceList: [sensitive], publicGroupList },
  heartbeat: { ...sensitive, heartbeatList, uptimeList } };
}
const json = (value) => new Response(JSON.stringify(value), {
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
});
function mockFetch(data = fixture()) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return json(url.includes('/heartbeat/') ? data.heartbeat : data.config);
  };
  return { calls, fetchImpl };
}
async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return `http://127.0.0.1:${server.address().port}`;
}
function request(base, path, method = 'GET', headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(path, base), { method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('fresh schemas contain only approved labels, public IDs and necessary heartbeat fields', () => {
  const data = fixture();
  data.config.publicGroupList.push({ name: sentinel, monitorList: [] });
  data.config.publicGroupList[0].monitorList.push({ id: 55555, name: sentinel });
  data.heartbeat.heartbeatList[55555] = [{ status: 1, ...sensitive }];
  data.heartbeat.uptimeList['55555_24'] = 1;
  const result = sanitize(data.config, data.heartbeat);
  assert.deepEqual(Object.keys(result.config), ['publicGroupList']);
  assert.deepEqual(Object.keys(result.heartbeat), ['heartbeatList', 'uptimeList']);
  for (const [i, group] of result.config.publicGroupList.entries()) {
    assert.deepEqual(Object.keys(group), ['name', 'monitorList']);
    assert.equal(group.name, APPROVED_GROUPS[i].name);
    assert.deepEqual(group.monitorList, APPROVED_GROUPS[i].monitors);
    for (const monitor of group.monitorList) {
      assert.deepEqual(Object.keys(monitor), ['id', 'name']);
      const beats = result.heartbeat.heartbeatList[monitor.id];
      assert.equal(beats.length, 28);
      assert.equal(beats[0].ping, 22);
      assert.equal(beats.at(-1).ping, 49);
      for (const beat of beats) assert.deepEqual(Object.keys(beat), ['status', 'ping']);
      assert.equal(result.heartbeat.uptimeList[`${monitor.id}_24`], 0.99);
    }
  }
  assert.equal(Object.keys(result.heartbeat.heartbeatList).length, 10);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(sentinel));
  assert.ok(!serialized.includes('9002'));
  assert.ok(!serialized.includes('55555'));
  for (const key of ['url', 'hostname', 'token', 'description', 'tags', 'unknown',
    'incident', 'maintenanceList', 'time', 'msg', 'sendUrl', 'type']) {
    assert.ok(!serialized.includes(`"${key}"`), key);
  }
  // The unchanged frontend accepts the minimized schema and replacement IDs.
  const ids = publicGroups(result.config).flatMap((g) => g.monitorList.map((m) => m.id));
  assert.equal(summarizeMonitors(ids, result.heartbeat).state, 'healthy');
  assert.equal(summarizeMonitors(ids, result.heartbeat).uptime, 99);
});

test('empty/missing heartbeats stay unknown; missing uptime is omitted; maintenance survives', () => {
  const data = fixture(0);
  const first = data.config.publicGroupList[0].monitorList[0].id;
  delete data.heartbeat.heartbeatList[first];
  data.heartbeat.uptimeList = {};
  const clean = sanitize(data.config, data.heartbeat);
  assert.deepEqual(clean.heartbeat.heartbeatList[101], []);
  assert.deepEqual(clean.heartbeat.uptimeList, {});
  assert.equal(summarizeMonitors([101], clean.heartbeat).state, 'unknown');
  data.heartbeat.heartbeatList[first] = [{ status: 3, ping: null }];
  const maintenance = sanitize(data.config, data.heartbeat);
  assert.deepEqual(maintenance.heartbeat.heartbeatList[101], [{ status: 3 }]);
  assert.equal(summarizeMonitors([101], maintenance.heartbeat).state, 'maintenance');
});

test('invalid/ambiguous approved inventory and invalid measurements fail closed', () => {
  const mutations = [
    (d) => { d.config.publicGroupList = null; },
    (d) => { d.config.publicGroupList.pop(); },
    (d) => { d.config.publicGroupList.push(d.config.publicGroupList[0]); },
    (d) => { d.config.publicGroupList[0].monitorList.pop(); },
    (d) => { d.config.publicGroupList[0].monitorList.push(d.config.publicGroupList[0].monitorList[0]); },
    (d) => { d.config.publicGroupList[0].monitorList[0].id = '__proto__'; },
    (d) => { d.config.publicGroupList[0].monitorList[0].id = 0; },
    (d) => { d.config.publicGroupList[0].monitorList[1].id = d.config.publicGroupList[0].monitorList[0].id; },
    (d) => { d.heartbeat.heartbeatList = []; },
    (d) => { d.heartbeat.heartbeatList[9002] = {}; },
    (d) => { d.heartbeat.heartbeatList[9002] = [null]; },
    (d) => { d.heartbeat.heartbeatList[9002] = [{ status: true }]; },
    (d) => { d.heartbeat.heartbeatList[9002] = [{ status: 99 }]; },
    (d) => { d.heartbeat.heartbeatList[9002] = [{ status: 1, ping: -1 }]; },
    (d) => { d.heartbeat.heartbeatList[9002] = [{ status: 1, ping: Infinity }]; },
    (d) => { d.heartbeat.uptimeList['9002_24'] = 1.1; },
    (d) => { d.heartbeat.uptimeList['9002_24'] = '1'; },
    (d) => { d.heartbeat.uptimeList['9002_24'] = NaN; }
  ];
  for (const mutate of mutations) {
    const data = fixture(); mutate(data);
    assert.throws(() => sanitize(data.config, data.heartbeat), /Invalid monitoring data/);
  }
});

test('only GET/HEAD routes are served and unsupported methods never fetch upstream', async (t) => {
  const mock = mockFetch();
  const base = await listen(t, createServer({ origin, fetchImpl: mock.fetchImpl }));
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    const res = await request(base, '/api/lab-status/config', method);
    assert.equal(res.status, 405);
    assert.equal(res.headers.allow, 'GET, HEAD');
  }
  const connectStatus = await new Promise((resolve, reject) => {
    const req = http.request(new URL('/api/lab-status/config', base), { method: 'CONNECT' });
    req.on('connect', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(connectStatus, 405);
  assert.equal(mock.calls.length, 0);
  assert.equal((await request(base, '/elsewhere')).status, 404);
  assert.equal(mock.calls.length, 0);
  const get = await request(base, '/api/lab-status/config');
  const head = await request(base, '/api/lab-status/config', 'HEAD');
  assert.equal(get.status, 200);
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  assert.equal(head.headers['content-length'], get.headers['content-length']);
  assert.equal(get.headers['cache-control'], 'no-store');
  assert.equal(mock.calls.length, 2);
});

test('visitor query, cookies, Authorization, headers and GET body do not reach Kuma', async (t) => {
  const mock = mockFetch();
  const base = await listen(t, createServer({ origin, fetchImpl: mock.fetchImpl }));
  const res = await request(base,
    '/api/lab-status/heartbeat?url=https://other.example.invalid/&slug=other&token=synthetic',
    'GET', { Cookie: sentinel, Authorization: `Bearer ${sentinel}`,
      'X-Forwarded-Host': sentinel, 'Content-Length': Buffer.byteLength(sentinel) }, sentinel);
  assert.equal(res.status, 200);
  assert.deepEqual(mock.calls.map((c) => c.url), upstreamUrls(origin));
  for (const call of mock.calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.credentials, 'omit');
    assert.deepEqual(call.options.headers, { Accept: 'application/json' });
    assert.equal(call.options.body, undefined);
  }
  assert.ok(!res.body.includes(sentinel));
});

test('untrusted origin configuration cannot add credentials, query or alternate paths', () => {
  for (const value of [undefined, '', 'file:///tmp/example', 'https://user:synthetic@example.invalid',
    'https://example.invalid/other', 'https://example.invalid/?path=other', 'https://example.invalid/#other']) {
    assert.throws(() => upstreamUrls(value), /Invalid monitoring origin/);
  }
});

test('invalid data, malformed JSON and raw upstream errors produce only generic 503', async (t) => {
  for (const fetchImpl of [
    async () => json({ ...sensitive }),
    async () => new Response(sentinel, { status: 500, headers: { 'X-Secret': sentinel } }),
    async () => new Response(sentinel, { headers: { 'Content-Type': 'application/json' } }),
    async () => { throw new Error(sentinel); }
  ]) {
    const base = await listen(t, createServer({ origin, fetchImpl }));
    for (const path of ['/api/lab-status/config', '/api/lab-status/heartbeat']) {
      const res = await request(base, path);
      assert.equal(res.status, 503);
      assert.deepEqual(JSON.parse(res.body), { error: 'Monitoring data unavailable' });
      assert.equal(res.headers['x-secret'], undefined);
      assert.ok(!JSON.stringify(res).includes(sentinel));
    }
  }
});

test('cache shares one in-flight pair and serialized snapshots across both endpoints', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const mock = mockFetch();
  let now = 0;
  const cache = createSnapshotCache({ origin, now: () => now, fetchImpl: async (...args) => {
    const response = await mock.fetchImpl(...args); await gate; return response;
  } });
  const waiting = Array.from({ length: 20 }, () => cache());
  assert.equal(mock.calls.length, 2);
  release();
  const snapshots = await Promise.all(waiting);
  assert.ok(snapshots.every((value) => value === snapshots[0]));
  assert.ok(!JSON.stringify(snapshots[0]).includes(sentinel));
  assert.equal(typeof snapshots[0].config, 'string');
  now = FRESH_MS - 1; await cache();
  assert.equal(mock.calls.length, 2);
  now = FRESH_MS; await cache();
  assert.equal(mock.calls.length, 4);
});

test('stale fallback expires, failures are throttled, and successful refresh recovers', async () => {
  let now = 0;
  let fail = false;
  const mock = mockFetch();
  let calls = 0;
  const cache = createSnapshotCache({ origin, now: () => now, fetchImpl: async (...args) => {
    calls++;
    if (fail) throw new Error(sentinel);
    return mock.fetchImpl(...args);
  } });
  const first = await cache();
  fail = true; now = FRESH_MS;
  assert.equal(await cache(), first);
  assert.equal(calls, 4);
  now += RETRY_MS - 1;
  assert.equal(await cache(), first);
  assert.equal(calls, 4);
  now = MAX_STALE_MS;
  assert.equal(await cache(), first);
  now++;
  assert.equal(await cache(), null);
  fail = false; now += RETRY_MS;
  assert.notEqual(await cache(), null);
});

test('cold failures are throttled and never create a cache entry', async () => {
  let calls = 0;
  const cache = createSnapshotCache({ origin, now: () => 0, fetchImpl: async () => {
    calls++; return json({ secret: sentinel });
  } });
  assert.equal(await cache(), null);
  assert.equal(await cache(), null);
  assert.equal(calls, 2);
});

test('upstream redirect is rejected without contacting the redirect target', async (t) => {
  let reachedTarget = false;
  const base = await listen(t, http.createServer((req, res) => {
    if (req.url === '/target') { reachedTarget = true; res.end(sentinel); }
    else { res.writeHead(302, { Location: '/target' }); res.end(); }
  }));
  await assert.rejects(fetchJson(`${base}/redirect`), /Unavailable upstream/);
  assert.equal(reachedTarget, false);
});

test('response type, declared size and streamed size are bounded', async () => {
  for (const response of [
    new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '10000' } }),
    new Response(JSON.stringify({ value: 'x'.repeat(100) }), { headers: { 'Content-Type': 'application/json' } })
  ]) {
    await assert.rejects(fetchJson(origin, { maxBytes: 32, fetchImpl: async () => response }), /Unavailable upstream/);
  }
});

test('timeout bounds stalled headers and stalled response bodies', async (t) => {
  const base = await listen(t, http.createServer((req, res) => {
    if (req.url === '/body') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{');
    }
  }));
  for (const path of ['/headers', '/body']) {
    const started = performance.now();
    await assert.rejects(fetchJson(base + path, { timeoutMs: 100 }), /Unavailable upstream/);
    assert.ok(performance.now() - started < 2000);
  }
});
