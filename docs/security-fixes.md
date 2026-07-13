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

| ID       | Date       | Category          | Title                                                                                    | Status    |
| -------- | ---------- | ----------------- | ---------------------------------------------------------------------------------------- | --------- |
| SEC-0001 | 2026-06-14 | authorization     | (Example) Missing server-side authz on order PATCH                                       | example   |
| SEC-0002 | 2026-06-22 | data-exposure     | Permissive dev CORS on the API (`Access-Control-Allow-Origin: *`)                        | addressed |
| SEC-0003 | 2026-06-26 | rate-limiting     | No rate limiting on the unauthenticated auth endpoints                                   | fixed     |
| SEC-0004 | 2026-06-26 | authentication    | Default JWT signing secret could reach production                                        | fixed     |
| SEC-0005 | 2026-06-28 | payment-integrity | Release/reset left the prior worker's quote & payment on the request                     | fixed     |
| SEC-0006 | 2026-07-11 | payment-integrity | A paid service request could still be cancelled (orphaned payment)                       | fixed     |
| SEC-0007 | 2026-07-11 | payment-integrity | Direct admin refund did not reverse the worker's payout (double-pay)                     | fixed     |
| SEC-0008 | 2026-07-11 | payment-integrity | Provider refund webhook did not reconcile the worker's payout                            | fixed     |
| SEC-0009 | 2026-07-13 | secrets-exposure  | Password-reset tokens written to the application log by the notification fallback sender | fixed     |

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
- **Related:** SEC-0005, SEC-0006, SEC-0008

### SEC-0008 — Provider refund webhook did not reconcile the worker's payout

- **Date:** 2026-07-11
- **Category:** payment-integrity
- **Severity:** medium
- **Affected area:** `server/src/services/paymentService.ts` (`confirmPaymentRefunded`, reached by `confirmPaymentRefundedByRef` ← the `payment.refunded` webhook on `POST /webhooks/payments`)
- **Vulnerability:** SEC-0007 fixed the admin refund action, but a refund can also arrive as a **provider webhook** — a refund issued directly from the Stripe/PayPal dashboard, or a chargeback — which settles through `confirmPaymentRefunded`, a different code path that our admin `refundPayment` never runs. That path marked the payment refunded **without touching the worker's payout**, so a still-`pending` payout would still transfer (slices 164/167): customer refunded externally **and** worker paid — the same double-pay as SEC-0007, via the webhook.
- **Root cause:** Same class as SEC-0007 (dependent-billing reconciliation missing on a refund path), but on the webhook settler rather than the admin action. It could not simply reuse the SEC-0007 fix: `reversePendingPayout` throws 409 on an already-paid payout, and a webhook must be **acknowledged** (throwing would make the provider retry forever and never record the refund), so the webhook path needs a non-throwing reconcile.
- **Canonical fix:** Add `reconcilePayoutForExternalRefund(paymentId)` to `payoutService` — the fait-accompli sibling of `reversePendingPayout`: it removes a still-pending payout (no double-pay) and is a **no-op (never throws)** for an already-paid-out payout (left for a manual clawback) or when there is no payout. `confirmPaymentRefunded` calls it before `markRefunded`. Rule for the class: an action the actor can retry (admin) fails closed (throw/409); a fait-accompli event (verified webhook) reconciles best-effort and always acknowledges.
- **Regression test:** `tests/refund-webhook-reverses-payout.test.mjs` (a `payment.refunded` webhook removes a still-pending payout and settles the refund; an already-paid-out payout is left paid while the webhook still returns 200 and records the refund).
- **Prevention:** This ledger entry + SEC-0007: every refund path (admin action AND provider webhook) must reconcile the payout; webhook settlers reconcile without throwing. Mandatory payments tests per `CLAUDE.md`.
- **Related:** SEC-0007, SEC-0005, SEC-0006

### SEC-0009 — Password-reset tokens written to the application log

- **Date:** 2026-07-13
- **Category:** secrets-exposure
- **Severity:** critical
- **Affected area:** `server/src/services/notificationProvider.ts` (`loggingSender`), reached from `server/src/services/passwordResetService.ts` (`requestPasswordReset`) and from every notification channel via `ProviderDelivery`.
- **Vulnerability:** The inert fallback sender logged the message in full: `logger.info(\`[notify:${channel}] to=${message.to} :: ${message.body}\`)`. It is the sender used whenever `EMAIL_API_URL`/`PUSH_API_URL`are unset — i.e. **every deployment that has not yet configured mail, including the live one**. The password-reset mail's body is`Use this code to reset your password: <token>`, so each `POST /auth/forgot-password`wrote the **plaintext reset token next to the email address it unlocks** into stdout. Anyone able to read the logs (any operator, and — decisively — any third-party log drain, which is exactly what those logs were about to be shipped to) could take over an arbitrary account: request a reset for the victim, read the token from the log, call`POST /auth/reset-password`. `resetPassword`also bumps`token_version`, so the legitimate owner is logged out of every session in the process. The token is stored **only as a SHA-256 hash** precisely because the plaintext is the secret; logging it defeated the entire design.
- **Root cause:** The logging sender was written as a developer convenience (print the message you would have sent) and was never re-examined once it became the **production fallback** rather than a dev-only stub. The class is broader than one line: `OutboundMessage` carried a secret (`body`) and PII (`to`) in fields that nothing marked as unloggable, so "don't log this" was a convention a reviewer had to notice, not a property the code enforced. `docs/deployment.md` had meanwhile promised that logs "never [contain] the request body, headers, or query string" — the guarantee was documented and untrue.
- **Canonical fix:** **Redact by construction, not by discipline.** Introduce `notificationLogFields(message)` as the _only_ way to log an outbound message; it returns `{ type, channel, userId, bodyChars }` and structurally cannot emit `to` or `body`. `OutboundMessage` gains `userId` (an internal UUID — already the join key in the audit log) so a delivery is still identifiable in a log without revealing how to reach the person; `to` and `body` are documented as never-loggable. The dev need is real (the reset token is unrecoverable from the DB, so a developer could not test forgot-password locally at all) and is met by an explicit `NOTIFY_LOG_BODY` escape hatch — which `env.ts` **refuses at boot in production**, reusing the SEC-0004 `superRefine` production-invariant pattern. Default is `false`: the safe behavior is what you get by doing nothing. Rule for the class: any value that is itself a delivery channel for a secret (reset tokens, OTPs, magic links, invite codes) must be unloggable at the type/API level, and any switch that would expose it must be refused in production at boot rather than trusted to configuration hygiene.
- **Regression test:** `tests/notification-log-redaction.test.mjs` — captures stdout and asserts (1) `loggingSender` emits neither the recipient nor the body, (2) `notificationLogFields` excludes them by construction (asserted on the _serialized_ fields, so a value smuggled in via nesting also fails), and (3) end-to-end, with **no sender override** — the real vulnerable path — `POST /auth/forgot-password` writes neither the address, nor the reset-mail text, nor any 64-hex token to stdout. Plus: `loadEnv` throws when `NOTIFY_LOG_BODY` is enabled in production.
- **Prevention:** This ledger entry + the regression test + the boot-time production guard (SEC-0004 pattern). `notificationLogFields` is the single approved way to log a message, so adding a field to it is a visible, reviewable act. Reviewer check for any new logging: **never log a resolved recipient (email / device token / phone) or user-facing message content.**
- **Residual — now CLOSED (slice 182).** This entry originally recorded a known gap: a _real_ provider's HTTP error text could echo the recipient — or the whole request body, which for the reset mail **is the plaintext token** — back inside its error message, and we log provider errors. It was left open because no real sender was configured, and stripping all provider error text would have destroyed the only diagnostic. Wiring up Resend (slice 182) made it live, so it was closed there rather than choosing between a useless log and a dangerous one: `emailSender.redactProviderError(text, message)` strips our exact `to` and our exact `body`, then sweeps for anything address-shaped or secret-shaped (a hex run of 32+) that the provider volunteered on its own. What survives is the part actually needed — "the domain is not verified". It is applied **in `passwordResetService` as well as in the sender**: `sender` is injectable, so the guarantee belongs with the function that _owns_ the secret, not with whichever sender happens to be wired in. Locked by `tests/email-sender.test.mjs` (redaction) and `tests/notification-log-redaction.test.mjs` (a failing provider is logged loudly and leaks nothing). **Rule for the class: a provider's error text is untrusted input — redact it against the message you sent before logging it.**
- **Related:** SEC-0004 (same boot-time production-invariant pattern), SEC-0002 (data-exposure via a dev-convenient default left reachable in production)
