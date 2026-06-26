# Security Fix Ledger

An append-only record of every security and vulnerability fix, so that similar issues are always resolved the same way. This file is the single source of truth for "how we fixed X": consult it before fixing, and update it after. The goal is consistency — the same class of vulnerability must not be fixed three different ways.

## How to use this ledger

Before fixing a security issue or vulnerability:

1. Search this file for the same category or symptom.
2. If a prior entry exists, reuse its canonical fix and regression-test pattern. Do not invent a new approach for an already-solved class of problem.
3. If the situation genuinely differs, extend the existing entry or add a related one and link them with their `SEC-NNNN` ids.

After the fix is merged:

1. Add a new entry using the template below, or update an existing one.
2. Give it the next `SEC-NNNN` id and add a row to the index.
3. Reference the entry id in the PR description and the commit message.

## Enforcement

- The `Security Ledger` CI workflow fails any PR that ticks the security-fix checklist item without adding a new `SEC-NNNN` entry here.
- This file and `SECURITY.md` are code-owner protected (`.github/CODEOWNERS`) and require security-reviewer approval once branch protection is enabled.

## Categories

Use exactly one of: `authentication`, `authorization`, `input-validation`, `injection`, `secrets-exposure`, `payment-integrity`, `idempotency`, `dependency`, `data-exposure`, `session`, `rate-limiting`, `other`.

## Index

| ID       | Date       | Category      | Title                                                             | Status          |
| -------- | ---------- | ------------- | ----------------------------------------------------------------- | --------------- |
| SEC-0001 | 2026-06-14 | authorization | (Example) Missing server-side authz on order PATCH                | example         |
| SEC-0002 | 2026-06-22 | data-exposure | Permissive dev CORS on the API (`Access-Control-Allow-Origin: *`) | mitigated (dev) |
| SEC-0003 | 2026-06-26 | rate-limiting | No rate limiting on the unauthenticated auth endpoints            | fixed           |

## Entry template

Copy this block for every new fix.

### SEC-NNNN — <short title>

- **Date:** YYYY-MM-DD
- **Category:** <one category from the list above>
- **Severity:** low | medium | high | critical
- **Affected area:** <file / module / endpoint>
- **Vulnerability:** <what was wrong and how it could be abused>
- **Root cause:** <why it happened>
- **Canonical fix:** <the agreed, reusable pattern to apply for this whole class — be specific>
- **Regression test:** <path to the test that locks this in>
- **Prevention:** <lint rule, gate, type, or review check that stops recurrence>
- **Related:** <SEC-xxxx ids, or none>

---

### SEC-0001 — (Example) Missing server-side authorization on order PATCH

> Example entry to show the format. Delete it once the first real fix is recorded.

- **Date:** 2026-06-14
- **Category:** authorization
- **Severity:** high
- **Affected area:** `server/src/controllers/orderController` (PATCH /orders/:id)
- **Vulnerability:** The endpoint trusted a client-supplied ownership flag, letting any authenticated user modify another user's order.
- **Root cause:** The authorization decision was made on the client and only echoed by the server; the controller mixed authorization with request handling.
- **Canonical fix:** Enforce authorization in a server-side service/middleware that loads the resource owner and compares it to the authenticated principal. Never trust client-provided identity, role, or ownership fields. Apply the same `assertCanAct(principal, resource, action)` helper to every order, payment, review, and profile mutation.
- **Regression test:** `server/tests/authorization/orderUpdate.authz.test.ts`
- **Prevention:** Server-side authorization checklist item in the PR template; an integration test asserting a non-owner receives 403.
- **Related:** none

### SEC-0002 — Permissive development CORS on the API

> Not a vulnerability fix — a deliberate, security-relevant configuration recorded so the production hardening is not forgotten.

- **Date:** 2026-06-22
- **Category:** data-exposure
- **Severity:** low
- **Affected area:** `server/src/middlewares/cors.ts` (applied in `server/src/app.ts` to all routes)
- **Vulnerability:** The CORS middleware returns `Access-Control-Allow-Origin: *`, allowing any web origin to call the API from a browser. With the current design this is safe: the API authenticates with a Bearer token in the `Authorization` header, not cookies, so there are no ambient credentials to leak cross-origin (the browser will not attach credentials, and `*` is incompatible with credentialed CORS anyway). It becomes a real data-exposure risk only if the API later adopts cookie/session auth or ships `*` to production.
- **Root cause:** The Expo web client runs on a different localhost port than the API, so cross-origin requests must be allowed for local development; the simplest dev-time setting is `*`.
- **Canonical fix:** Keep CORS off credentialed mode while using Bearer-token auth. Before production, restrict `Access-Control-Allow-Origin` to an explicit allowlist of known web origins (driven by an env var, e.g. `CORS_ALLOWED_ORIGINS`), and never combine `*` with `Access-Control-Allow-Credentials: true`. If cookie/session auth is ever introduced, this becomes mandatory, not optional.
- **Regression test:** `tests/cors.test.mjs` (asserts the preflight + header behavior; tighten to assert an allowlist once origins are restricted).
- **Prevention:** This ledger entry as a release-gate reminder; revisit when adding any cookie/session auth or preparing a production deploy.
- **Related:** none

### SEC-0003 — No rate limiting on the unauthenticated auth endpoints

- **Date:** 2026-06-26
- **Category:** rate-limiting
- **Severity:** medium
- **Affected area:** `server/src/routes/auth.ts` (`POST /auth/login`, `POST /auth/register`)
- **Vulnerability:** Both endpoints accepted unlimited requests from a single client, allowing brute-force / credential-stuffing against login and automated mass-account creation against register (the latter added in slice 59a with no abuse guard).
- **Root cause:** No application-level throttling existed anywhere in `server/src`; the endpoints were mounted bare.
- **Canonical fix:** Apply a per-client (per-IP) fixed-window rate limiter to every unauthenticated, abuse-prone endpoint. Use the shared `createRateLimiter({ windowMs, max })` middleware (`server/src/middlewares/rateLimit.ts`), which throws `AppError(…, 429)` past the limit; mount one shared instance across the related auth endpoints so a client cannot spread attempts across them. When the API is deployed behind a proxy/CDN, pair this with an edge limiter and set `trust proxy` so `req.ip` is the real client. Do not invent a second limiter implementation — reuse this middleware for any future sensitive endpoint (e.g. password reset).
- **Regression test:** `tests/rate-limit.test.mjs` (asserts requests succeed up to the limit and the next one returns 429).
- **Prevention:** Reuse the `createRateLimiter` middleware for any new unauthenticated/sensitive route; this ledger entry as the pattern of record.
- **Related:** none
