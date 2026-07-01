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

The image is multi-stage: a build stage installs all dependencies and runs
`npm run build`, and a slim runtime stage installs production dependencies only
(`npm ci --omit=dev`) and copies in `dist/`. Neither `tsx` nor the TypeScript
toolchain is present in the deployed image.

```bash
docker build -t homefix-api .

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/homefix" \
  -e JWT_SECRET="a-strong-secret-value" \
  -e CORS_ALLOWED_ORIGINS="https://app.homefix.example" \
  homefix-api
```

## Deploying on Railway

Railway auto-detects the `Dockerfile` and builds the image. Provision a Postgres
plugin and the server picks up the injected `DATABASE_URL`; Railway also injects
`PORT`, which the server already reads. Set `NODE_ENV=production`, a strong
`JWT_SECRET`, and `CORS_ALLOWED_ORIGINS` for the real web origin(s) in the service
variables. Pending migrations run automatically on boot.

## Health probes

Wire both into your orchestrator so traffic is held until the instance is ready
and drained when its database goes away:

- `GET /health` — liveness. Always `200`; never touches the database.
- `GET /ready` — readiness. Runs `SELECT 1`; returns `200` when the database is
  reachable (or no database is configured), `503` when a configured database is
  down.

Every response carries an `X-Request-Id` header (generated, or echoed from an
inbound one) that matches the structured access log line for that request.

## Notes and future work

- Demo users are seeded outside production only (see `SEED_DEMO_USERS`); a real
  production deploy creates no demo accounts by default.
- Unexpected (5xx) errors are logged with structured context (request id, method,
  route path, error name, mess
