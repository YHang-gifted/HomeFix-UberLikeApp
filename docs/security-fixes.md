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

| ID       | Date       | Category          | Title                                                                | Status    |
| -------- | ---------- | ----------------- | -------------------------------------------------------------------- | --------- |
| SEC-0001 | 2026-06-14 | authorization     | (Example) Missing server-side authz on order PATCH                   | example   |
| SEC-0002 | 2026-06-22 | data-exposure     | Permissive dev CORS on the API (`Access-Control-Allow-Origin: *`)    | addressed |
| SEC-0003 | 2026-06-26 | rate-limiting     | No rate limiting on the unauthenticated auth endpoints               | fixed     |
| SEC-0004 | 2026-06-26 | authentication    | Default JWT signing secret could reach production                    | fixed     |
| SEC-0005 | 2026-06-28 | payment-integrity | Release/reset left the prior worker's quote & payment on the request | fixed     |
| SEC-0006 | 2026-07-11 | payment-integrity | A paid service request could still be cancelled (orphaned payment)   | fixed     |
| SEC-0007 | 2026-07-11 | payment-integrity | Direct admin refund did not reverse the worker's payout (double-pay) | fixed     |

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
- **Canonical fix:** Keep CORS off credentialed mode while using Bearer-token auth. Restrict `Access-Control-Allow-Origin` to an explicit allowlist of known web origins, driven by the `CORS_ALLOWED_ORIGINS` env var (comma-separated). **Implemented in slice 67:** `createCorsMiddleware(allowedOrigins)` (`server/src/middlewares/cors.ts`) returns `*` only when the allowlist is empty (dev default); when set, it echoes back the request `Origin` only if it is on the list, adds `Vary: Origin`, and otherwise omits the allow-origin header so the browser blocks the response. Production must set `CORS_ALLOWED_ORIGINS` to the known web origin(s). Never combine an allowlist with `Access-Control-Allow-Credentials: true` while the origin is `*`. If cookie/session auth is ever introduced, setting the allowlist becomes mandatory.
- **Regression test:** `tests/cors.test.mjs` — asserts the dev `*` default, plus (with an allowlist) that an allowed origin is echoed with `Vary: Origin`, a disallowed origin gets no allow-origin header, and `*` is never returned when restricted.
- **Prevention:** This ledger entry + the regression test; set `CORS_ALLOWED_ORIGINS` in every production deploy. Revisit if cookie/session auth is added.
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

### SEC-0004 — Default JWT signing secret could reach production

- **Date:** 2026-06-26
- **Category:** authentication
- **Severity:** high
- **Affected area:** `server/src/config/env.ts` (`JWT_SECRET`), consumed by `server/src/auth/jwt.ts`
- **Vulnerability:** `JWT_SECRET` defaulted to a hard-coded value (`dev-insecure-secret-change-me-please`) that lives in the public source tree. If a production deploy forgot to override it, every JWT would be signed with a publicly known key, so anyone could forge a token for any user/role (full authentication bypass + privilege escalation to admin).
- **Root cause:** A convenience dev default with no environment-aware guard, so a missing prod env var failed open instead of failing closed.
- **Canonical fix:** Fail closed on weak secrets in production. `loadEnv` (`superRefine`) throws when `NODE_ENV === 'production'` and `JWT_SECRET` equals the exported `DEV_JWT_SECRET`, so the server refuses to boot rather than run with a forgeable key. Apply the same fail-closed env validation to any future production-only secret (DB credentials, payment provider keys, signing keys): never ship a usable default to production.
- **Regression test:** `tests/env.test.mjs` (production + default/unset secret throws; a strong secret in production is accepted; dev/test keep the default).
- **Prevention:** The `loadEnv` guard runs at startup on every deploy; extend it for each new secret. This ledger entry as the pattern of record.
- **Related:** none

### SEC-0005 — Release/reset of a job left the prior worker's quote & payment behind

- **Date:** 2026-06-28
- **Category:** payment-integrity
- **Severity:** high
- **Affected area:** `server/src/services/serviceRequestService.ts` (`releaseRequest`, `resetRequest`), with `quoteRepository` / `paymentRepository`
- **Vulnerability:** Returning a job to the pool (a worker releasing, or an admin resetting) only changed `status`→`pending` and cleared `workerId`; it did not touch the request's quote or payment. Because quotes and payments are one-per-request (`request_id UNIQUE`, and `createQuote` 409s when one exists), after worker A quoted (and possibly the customer paid) and A released, worker B could claim the job but could **never submit a new quote** (perpetual 409), and any payment stayed attributed to A — including the dangerous case where the customer had already paid A but A could still hand the job off, orphaning the money with the wrong worker.
- **Root cause:** Cross-domain lifecycle coupling was missed: the request state machine (release/reset) was added (slices 97/98) without coordinating the dependent billing records (quotes/payments, slices 72/62). No test exercised release/reset together with quote/payment.
- **Canonical fix:** Returning a job to the pool must reconcile its dependent billing. (1) **Fail closed on settled money:** `assertNotPaid(requestId)` throws `AppError(…, 422)` if a `paid` payment exists, so a paid job can never be released or reset (there is no refund flow — that is a separate future capability). (2) **Clear stale, unsettled billing:** on a successful release/reset, `clearBillingForRelease(requestId)` calls `quoteRepository.deleteByRequest` and `paymentRepository.deleteByRequest`, removing the old quote and any _unpaid_ payment so the next worker starts clean. Apply this same "guard settled state, then clear dependent unsettled records" pattern to any future action that re-pools or reassigns a request (e.g. cancellation refunds, dispute resets). Added `deleteByRequest` to both `QuoteRepository` and `PaymentRepository` (in-memory + Postgres).
- **Regression test:** `tests/release-reset-billing-consistency.test.mjs` (worker release clears the old quote + unpaid payment so a new worker can re-quote; a paid job is blocked from release AND reset with its payment preserved; admin reset clears the old quote + unpaid payment). Repo-level `deleteByRequest` covered in `tests/postgres-quote-repository.test.mjs` and `tests/postgres-payment-repository.test.mjs`.
- **Prevention:** This ledger entry as the pattern of record; any new request-lifecycle action that re-pools a request must consider quotes/payments and add a cross-domain test. Mandatory tests for matching/payments/order-state per `CLAUDE.md`.
- **Related:** SEC-0006

### SEC-0006 — A paid service request could still be cancelled (orphaned payment)

- **Date:** 2026-07-11
- **Category:** payment-integrity
- **Severity:** high
- **Affected area:** `server/src/services/serviceRequestService.ts` (`updateServiceRequestStatus`, the `→ cancelled` transition)
- **Vulnerability:** Paying a request only flips `payment.status` to `paid`; it does not change the service-request status. The cancel authorization only checked whether the status was terminal (`completed`/`cancelled`) and never consulted the payment. So a paid-but-not-yet-`completed` request (`matched`/`accepted`/`in_progress`) could still be cancelled by the owning customer (or an admin), leaving a settled payment attached to a cancelled job with **no refund flow** — the customer's money is taken but the job is voided. Same class as SEC-0005, which had already blocked _release_ (worker) and _reset_ (admin) on a paid job, but the _cancel_ transition was missed. Found in manual QA of the order→assign→pay flow.
- **Root cause:** The request state machine and the billing lifecycle are separate domains; the SEC-0005 fix guarded the two re-pool actions (release/reset) but not the customer/admin cancel transition, which is a different code path in `updateServiceRequestStatus`. No test exercised cancel-after-paid.
- **Canonical fix:** Reuse the SEC-0005 guard. `updateServiceRequestStatus` now calls the shared `assertNotPaid(requestId)` before applying a `→ cancelled` transition, so a paid job cannot be cancelled by any actor (customer or admin) — it throws `AppError(…, 422)`. The guard's message was generalized to "cancelled, released, or reset". The app hides the cancel control when the payment is `paid` (`RequestDetailScreen`), but the server check is authoritative. Refund-then-cancel (an admin capability) remains a separate future feature, exactly like refund-then-release under SEC-0005.
- **Regression test:** `tests/cancel-paid-guard.test.mjs` (a paid request cannot be cancelled — 422, payment preserved; an unpaid request can still be cancelled — 200).
- **Prevention:** This ledger entry + SEC-0005 as the pattern of record: any request-lifecycle transition that voids or re-pools a request must call `assertNotPaid` and add a cross-domain test. Mandatory tests for matching/payments/order-state per `CLAUDE.md`.
- **Related:** SEC-0005

### SEC-0007 — Direct admin refund did not reverse the worker's payout

- **Date:** 2026-07-11
- **Category:** payment-integrity
- **Severity:** medium
- **Affected area:** `server/src/services/paymentService.ts` (`refundPayment`), reached by `POST /service-requests/:id/payment/refund`
- **Vulnerability:** Settling a payment schedules the worker's net as a payout (`markPaid` → `createPayoutForPayment`). The **cancel-and-refund** flow (`adminCancelService`) reversed that payout before refunding, but the **standalone refund endpoint** called `refundPayment` directly, which reversed the charge at the provider and marked the payment refunded **without touching the payout**. So an admin refunding a paid request (without cancelling) left the worker's payout intact: a still-`pending` payout would still transfer the net to the worker (slices 164/167) — the customer is refunded **and** the worker is paid, a silent double loss — and an already-paid-out payout had no guard at all. Admin-gated, but with real Stripe Connect payouts live it moves real money and was completely untested.
- **Root cause:** Cross-domain lifecycle coupling missed on one path: the payout-reversal was implemented in the cancel orchestrator (`adminCancelService`) rather than inside `refundPayment` itself, so the direct refund endpoint — a second caller of the same operation — bypassed it. Same class as SEC-0005/0006 (guard settled state, then reconcile dependent billing), one code path short.
- **Canonical fix:** Move the reconciliation **into** `refundPayment` so every caller is safe: before any money moves it calls `reversePendingPayout(payment.id)`, which removes a still-pending payout (no double-pay) and throws `AppError(…, 409)` if the payout was already sent (refund aborts before the provider refund and before `markRefunded`; the worker's net needs a manual clawback). `adminCancelService` was simplified to just call `refundPayment` (it no longer needs its own reversal). This mirrors SEC-0005's "guard settled money, then clear dependent unsettled records" applied to the refund action; reuse it for any future action that unwinds a settled payment.
- **Regression test:** `tests/refund-reverses-payout.test.mjs` (refunding a paid payment removes the still-pending payout; a payment whose payout was already sent aborts the refund with 409, leaving both payment and payout paid). Existing `tests/stripe-refund.test.mjs` / `tests/paypal-refund.test.mjs` still pass (their pending payout is simply reversed).
- **Prevention:** This ledger entry + SEC-0005/0006 as the pattern of record: reconciliation of dependent billing must live in the shared service operation, not in one orchestrator, so every caller inherits it. Any new caller of `refundPayment` (or a new refund path) is covered automatically; mandatory payments tests per `CLAUDE.md`.
- **Related:** SEC-0005, SEC-0006
