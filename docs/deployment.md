# Deploying the HomeFix API

This covers the server (`server/`). The Expo app (`app-expo/`) ships separately.

## Configuration

The server is configured entirely through environment variables, validated at
startup by `server/src/config/env.ts` (see `.env.example`). The active variables:

- `NODE_ENV` — `production` for a deployed instance.
- `PORT` — listen port (default `3000`).
- `DATABASE_URL` — Postgres connection string. Pending migrations run
  automatically on boot. Without it the server falls back to an in-memory store,
  which is for development only and loses data on restart.
- `JWT_SECRET` — strong, non-default secret (at least 16 characters). In
  production the server refuses to boot with the built-in dev default (SEC-0004).
- `JWT_EXPIRES_IN` — token lifetime in seconds (default `604800`, 7 days).
- `CORS_ALLOWED_ORIGINS` — comma-separated browser origins permitted to call the
  API. Empty serves a permissive `*` suitable only for development; set the real
  origin(s) in production (SEC-0002).
- `NOTIFY_CHANNELS` — comma-separated notification channels to enable (`email`,
  `push`). Empty delivers to no external channel.
- `SEED_DEMO_USERS` — `true`/`false`. Unset seeds the three demo users outside
  production but never in production; set explicitly to override.
- `EMAIL_API_URL` / `EMAIL_API_KEY` / `EMAIL_FROM` — the HTTP email provider for
  the `email` channel. Set all three to actually send emails; leave any unset and
  the email channel only logs. The provider receives a JSON
  `{ from, to, subject, text }` POST with `Authorization: Bearer EMAIL_API_KEY`.
- `PUSH_API_URL` — the push endpoint for the `push` channel (e.g. the Expo push
  API, `https://exp.host/--/api/v2/push/send`). Set it to actually send push;
  leave unset and the push channel only logs. The endpoint receives a JSON
  `{ to, title, body }` POST.
- `STRIPE_SECRET_KEY` — set it to take real payments via Stripe hosted Checkout
  (each payment opens a Checkout Session, idempotent on the payment id, and the app
  redirects the customer to Stripe's page); leave unset and the inert mock provider
  is used. When it is set, `STRIPE_CHECKOUT_SUCCESS_URL` and
  `STRIPE_CHECKOUT_CANCEL_URL` are **required** — the server fails fast on boot
  otherwise. Point them at the app's public URL with a marker, e.g.
  `https://app.homefix.example/?payment=success` and `…/?payment=cancelled`. Use a
  test-mode key (`sk_test_…`) outside production. Never commit a real key.
- `STRIPE_WEBHOOK_SECRET` — Stripe's webhook signing secret (`whsec_…`). Set it
  together with `STRIPE_SECRET_KEY` to accept `POST /webhooks/stripe`: the
  `Stripe-Signature` header is verified against it and a `checkout.session.completed`
  event settles the matching payment (resolved via the payment id in the session
  metadata). Leave it unset and the Stripe webhook endpoint is disabled (404) — do
  this until go-live so no real payment can be confirmed by accident. Point Stripe's
  dashboard webhook at `https://<your-host>/webhooks/stripe`. (The separate
  `PAYMENTS_WEBHOOK_SECRET` guards the mock `POST /webhooks/payments` HMAC endpoint.)
- `STORAGE_S3_BUCKET` / `STORAGE_S3_REGION` / `STORAGE_S3_ACCESS_KEY_ID` /
  `STORAGE_S3_SECRET_ACCESS_KEY` — object storage for uploaded images. Set all
  four to store images in real S3 (the API returns a presigned PUT URL the client
  uploads to directly); leave any unset and uploads use the in-memory mock store
  (dev/test). Optional: `STORAGE_S3_PUBLIC_BASE_URL` (a CDN/read base — defaults to
  the bucket's virtual-hosted URL), `STORAGE_S3_ENDPOINT` (S3-compatible stores
  like R2/MinIO), `STORAGE_S3_UPLOAD_EXPIRES_SECONDS` (presigned URL lifetime,
  default 900). Credentials are never committed.

## Build

The server ships as compiled JavaScript. `tsconfig.build.json` emits CommonJS to
`dist/` (relative `.ts` imports are rewritten to `.js` on emit); the entrypoint is
`dist/server/src/server.js`.

```bash
npm run build   # tsc -p tsconfig.build.json -> dist/
npm start       # node dist/server/src/server.js
```

`npm run dev` still runs the TypeScript sources directly via `tsx` for local
development; only production runs the compiled output.

## Build and run with Docker

The image is multi-stage: a `build` stage compiles the server, a `webbuild` stage
exports the Expo web bundle, and a slim `runtime` stage installs production
dependencies only (`npm ci --omit=dev`) and copies in the compiled `dist/` plus
`app-expo/dist`. Neither `tsx`, the TypeScript toolchain, nor the Expo build
tooling is present in the deployed image. The runtime sets `WEB_DIST_DIR`, so the
image serves the web app same-origin out of the box.

The web build inlines the API origin at build time, so pass it as a build arg
(**required** — the build fails fast without it). For a same-origin deploy it is
the deployment's own public URL:

```bash
docker build -t homefix-api \
  --build-arg EXPO_PUBLIC_API_BASE_URL=https://app.homefix.example .

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/homefix" \
  -e JWT_SECRET="a-strong-secret-value" \
  homefix-api
```

Because the web app is served same-origin, `CORS_ALLOWED_ORIGINS` can stay unset.
Building the web bundle runs Metro and needs more memory/time than the server
build alone.

### Optional: Google Static Maps thumbnail

To render the small map thumbnail in the request Location section, pass a Google
Static Maps API key as the **optional** build arg
`EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY`. Leave it unset and the UI falls back to the
address/coordinates text and the "Open in Maps" link (no broken image).

```bash
docker build -t homefix-api \
  --build-arg EXPO_PUBLIC_API_BASE_URL=https://app.homefix.example \
  --build-arg EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY=your-static-maps-key .
```

This key is inlined into the **public** web bundle, so it is not a secret in the
usual sense — but it MUST be locked down in Google Cloud so it can't be abused:

- **Application restriction → HTTP referrers**: allow only the web origin(s), e.g.
  `https://app.homefix.example/*` (add each origin you serve from).
- **API restriction**: restrict the key to the **Maps Static API** only.
- Optionally set a usage quota/budget alert as a backstop.

On Railway, add `EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY` as a service variable; the
Dockerfile declares the matching `ARG`, so it is supplied to the build and inlined.
Because Expo inlines `EXPO_PUBLIC_*` at build time, changing the key requires a
rebuild/redeploy, not just a restart.

## Deploying on Railway

Railway auto-detects the `Dockerfile` and builds the image. Provision a Postgres
plugin and the server picks up the injected `DATABASE_URL`; Railway also injects
`PORT`, which the server already reads. Set `NODE_ENV=production` and a strong
`JWT_SECRET` in the service variables, and set the **build arg**
`EXPO_PUBLIC_API_BASE_URL` to the service's public URL so the bundled web app calls
back to the same origin. Pending migrations run automatically on boot. For this
same-origin setup `CORS_ALLOWED_ORIGINS` can stay unset; set it only if you also
serve the app from a different origin.

## Health probes

Wire both into your orchestrator so traffic is held until the instance is ready
and drained when its database goes away:

- `GET /health` — liveness. Always `200`; never touches the database.
- `GET /ready` — readiness. Runs `SELECT 1`; returns `200` when the database is
  reachable (or no database is configured), `503` when a configured database is
  down.

Every response carries an `X-Request-Id` header (generated, or echoed from an
inbound one) that matches the structured access log line for that request.

## Realtime (WebSocket)

Live chat is pushed over a WebSocket at `GET /ws/messages?requestId=<id>&token=<jwt>`
(the bearer token rides the query string because browsers can't set an
Authorization header on a WebSocket). The socket is authenticated and authorized
exactly like the REST message routes (token signature, token-version revocation,
active account, and the request-party check), then receives each new message on
that thread as JSON. It shares the HTTP server/port, so any proxy in front must
allow WebSocket upgrades on that path. Message polling remains as a fallback, so
the feature degrades gracefully if the socket can't connect.

## Serving the web app (same origin)

The Expo web build can be served by this same server, so the web app and API
share one origin — no CORS to configure, and the WebSocket connects to the same
host automatically.

1. Build the web bundle, pointing it at the API origin it will be served from
   (Expo inlines `EXPO_PUBLIC_*` at build time). For a same-origin deploy this is
   the deployment's own URL:

   ```bash
   cd app-expo
   EXPO_PUBLIC_API_BASE_URL=https://api.homefix.example npm run export:web
   # → app-expo/dist
   ```

2. Point the server at that bundle with `WEB_DIST_DIR` (an absolute path). On boot
   it serves the static assets and an SPA fallback (so client-side routes work on
   refresh/deep-link) **after** the API routes, so it never shadows the API — an
   unknown API path still returns the normal JSON 404. Leave `WEB_DIST_DIR` unset
   and only the API is served.

   ```bash
   WEB_DIST_DIR=/app/app-expo/dist npm start
   ```

In a Docker/Railway deploy, run the web export in the build stage and copy
`app-expo/dist` into the image, then set `WEB_DIST_DIR` to its path. Because the
app is same-origin, `CORS_ALLOWED_ORIGINS` can stay empty for this setup.

## Notes and future work

- Demo users are seeded outside production only (see `SEED_DEMO_USERS`); a real
  production deploy creates no demo accounts by default.
- Unexpected (5xx) errors are logged with structured context (request id, method,
  route path, error name, message, and stack), correlated by the `X-Request-Id` of
  the request that produced them.

## Logging & log shipping

The server logs to stdout/stderr as **one self-contained JSON object per line**
(the default `LOG_FORMAT=json`), for example:

```json
{
  "level": "info",
  "time": "2026-07-08T02:15:04.512Z",
  "msg": "request",
  "type": "request",
  "requestId": "…",
  "method": "GET",
  "path": "/service-requests",
  "status": 200,
  "durationMs": 7
}
```

Because each line is a complete JSON object (no prefix), a log drain can parse and
index the fields directly. Access logs carry `type:"request"` (method, route path,
status, `durationMs`); unexpected 5xx errors carry `type:"error"` (error name,
message, stack) — both correlated by `requestId`. Only that whitelist is ever
logged: never the request body, headers, or query string, so bearer tokens and
other secrets can't leak into the logs.

To ship the logs somewhere queryable, point your platform's log drain at stdout:

- **Railway**: add a Log Drain (Project → Settings → Log Drains) targeting your
  provider's HTTPS/syslog endpoint (Logtail/Better Stack, Datadog, Axiom, etc.).
  Railway forwards the container's stdout lines; because they're already JSON, the
  destination parses the fields with no extra config.
- **Docker/other**: run behind a log driver or a sidecar (Vector, Fluent Bit) that
  tails stdout and forwards to your store.

Set `LOG_FORMAT=pretty` in local development for a compact human-readable line
(`[info] request {…}`); leave it unset (or `json`) everywhere the logs are shipped.

## Metrics (Prometheus)

`GET /metrics` exposes Prometheus text-format metrics for scraping:

- `homefix_http_requests_total{method,status}` — request counter (labeled by method
  and status only; never the path, so cardinality stays bounded).
- `homefix_http_request_duration_seconds_sum` / `_count` — cumulative handling time
  (divide for the average latency).
- `homefix_http_requests_in_flight` — gauge of requests currently being handled.
- `process_uptime_seconds`, `process_resident_memory_bytes` — basic process gauges.

The body is aggregate counters only — no user data and no request paths. Set
`METRICS_TOKEN` to require `Authorization: Bearer <token>` on the endpoint (401
otherwise); leave it unset and `/metrics` is open (dev / trusted network). In
production, set the token or restrict `/metrics` to your monitoring network at the
proxy. Point Prometheus (or Grafana Agent / the platform's scraper) at
`https://<your-host>/metrics` with the bearer token configured.
