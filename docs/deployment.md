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

## Build and run with Docker

```bash
docker build -t homefix-api .

docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/homefix" \
  -e JWT_SECRET="a-strong-secret-value" \
  -e CORS_ALLOWED_ORIGINS="https://app.homefix.example" \
  homefix-api
```

The image runs the server with `tsx` (no compile step yet — see below).

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

- The image installs all dependencies and runs TypeScript via `tsx`. A future
  ops slice should add a `tsc` build and a dev-dependency-free image for a
  smaller, leaner production artifact.
- Demo users are seeded outside production only (see `SEED_DEMO_USERS`); a real
  production deploy creates no demo accounts by default.
- A managed Postgres, log shipping/rotation, and a deploy target (the platform
  that runs this image) are still to be provisioned.
