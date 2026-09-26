# Public monitoring sanitizer

The browser keeps using `/api/lab-status/config` and `/api/lab-status/heartbeat`.
Nginx routes only those exact paths to this internal Node service. The service
uses built-in Node APIs, with no package dependencies or administrative actions.
Frontend components and their 60-second polling behavior are unchanged.

## Deployment

Set `KUMA_ORIGIN` privately in the deployment environment or the root `.env`
(already ignored by Git). Its value must be the existing Kuma HTTP(S) origin,
including a port if required, with no path, query, fragment, or URL credentials.
Do not commit the value. The two upstream paths are hardcoded in `server.mjs`:

- `/api/status-page/rock-solid-labs`
- `/api/status-page/heartbeat/rock-solid-labs`

From the repository root, with the environment configured:

```sh
docker compose config --quiet
docker compose build
docker compose up -d --force-recreate
```

The deployment command is for the operator; implementation/testing does not
publish or start production containers. Recreate the web container when replacing
the sanitizer container so Nginx resolves its current service address.

The sanitizer has no host port. Only `resume` and `status-sanitizer` share the
internal `monitoring-api` network. The separate `monitoring-egress` network is
joined only by the sanitizer and allows its fixed outbound Kuma requests. Docker
host administrators still control container networking; this is service isolation,
not a boundary against a privileged host administrator. Verify the existing Kuma
hostname resolves and is reachable from the new service's egress network.

The image runs as the unprivileged Node user, with a read-only filesystem,
dropped capabilities and no-new-privileges. Its build context allows only the two
runtime modules and Dockerfile. No Kuma credentials are needed or forwarded.

## Publication policy and schemas

`sanitize.mjs` contains the explicit approved group/monitor labels and replacement
public IDs (101-106 and 201-204). These labels preserve the audited public inventory.
Matching uses exact group and monitor names; public labels are emitted from local
constants, never copied from upstream text. Adding or renaming an approved monitor
requires a deliberate policy update. Unknown groups, monitors and properties are
ignored. Missing/duplicate approved entries or ambiguous upstream IDs fail closed.

These are the complete successful JSON shapes; symbolic keys describe the IDs in
the approved policy, rather than extra JSON properties:

```ts
// GET /api/lab-status/config
{
  publicGroupList: Array<{
    name: string; // approved label only
    monitorList: Array<{ id: number; name: string }>; // public ID, approved label
  }>;
}

// GET /api/lab-status/heartbeat
{
  heartbeatList: Record<string, Array<{
    status: 0 | 1 | 2 | 3;
    ping?: number; // finite, nonnegative milliseconds; used by existing tooltips
  }>>; // keys are replacement public IDs; at most 28 entries, in upstream order
  uptimeList: Record<string, number>; // keys PUBLIC_ID_24; finite fractions in [0, 1]
}
```

Status 2 remains pending/unknown in the existing frontend; status 3 is maintenance.
A missing/empty history becomes an empty list, never an artificial healthy record.
Missing/null uptime is omitted. Invalid statuses, latency, uptime, container shapes,
or required inventory cause an unavailable result. The last 28 entries are retained
because the existing live-status component renders `history.slice(-28)`.

No upstream IDs, URLs, hostnames, IPs, ports, types, tags, messages, timestamps,
descriptions, page settings, CSS, incident/maintenance text, analytics or certificate
metadata are copied. Unknown future properties are discarded automatically. Labels
and numeric public IDs are not access tokens and are intentionally public.

## Cache, requests and failure behavior

- Both responses are refreshed as one pair on demand, shared by all visitors.
- Successful sanitized JSON strings are cached in memory for 60 seconds.
- Concurrent requests share one in-flight refresh (two upstream GETs total).
- If refresh fails, the previous sanitized snapshot may be used only while its
  total age is at most 300 seconds since the last successful refresh.
- Failed refreshes have a 10-second retry cooldown, including on a cold cache.
- Stale/failed attempts never extend the age of the last successful snapshot.
- No raw upstream bodies are cached, returned, or logged. Public responses have
  `Cache-Control: no-store` so downstream caches cannot extend the stale limit.
- The cache age measures successful retrieval, not the age of a heartbeat at Kuma.
  This service does not introduce a heartbeat timestamp/freshness policy.
- Each upstream request has a 5-second timeout spanning headers and body, a 1 MiB
  decoded body limit, and a JSON content-type check. Redirects are rejected.
- Visitor queries are ignored; cookies, Authorization, headers and request bodies
  are never used to construct upstream requests. Only a fixed Accept header is set.
- GET and HEAD are supported. Other methods return 405; unknown paths return 404.
  HEAD returns the same status/headers as GET without a response body.
- Without an acceptable snapshot, both API paths return HTTP 503 with exactly
  `{"error":"Monitoring data unavailable"}`. The existing frontend then shows
  unavailable states. No raw error body, exception text, or upstream header escapes.
- Nginx also blocks unsupported methods, suppresses request bodies/credentials,
  and retains the existing site security headers. Its locally generated method or
  connection errors can be generic Nginx error pages; they never contain Kuma JSON.

## Validation

From the repository root:

```sh
node --test app/tests/hardening.test.mjs status-sanitizer/tests/sanitizer.test.mjs
npm --prefix app run build
docker compose build
```

Tests use synthetic fixtures and local HTTP servers only; no live Kuma access is
needed. Before production rollout, verify Compose isolation and origin reachability,
Nginx configuration, GET/HEAD/405 behavior, absence of raw fields in public responses,
all four monitoring displays, and bounded stale/unavailable behavior during an
upstream outage. Approved labels must still match the actual public Kuma inventory.
