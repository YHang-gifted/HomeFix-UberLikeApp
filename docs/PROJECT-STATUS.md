# HomeFix — Project Status & Road to a Testable v1

_Snapshot as of 2026-07-13 (through slice 178). Compiled against the original vision:
an Uber-like home-repair marketplace with three roles (customer, worker, admin), a
request lifecycle, worker matching, quoting, payments, reviews, and messaging._

> **Update log (2026-07-13).** The **Stripe money line has been run for real.** A
> test-mode dry run against a Stripe sandbox took a payment through hosted Checkout, settled
> it on the signed webhook, onboarded a worker to a **Connect** account, and **transferred
> the payouts** — including the backfill, which released three payouts that had been waiting
> on onboarding the instant the account became payouts-enabled. It also found **three defects
> that every test we have had passed**, because nothing in CI talks to a provider: the
> missing `transfers` capability (**171**), a hard-coded TWD currency (**172**), and an
> unmapped provider error surfacing as a bare 500 (**178**). PayPal is built and unit-tested
> but has **not** yet met a real provider.
>
> The line itself: real **Stripe** hosted Checkout and real **PayPal** (Orders v2) coexist as
> selectable methods, both settling only via signature-verified webhooks; real **refunds**
> work at both providers; real **payouts** run over **Stripe Connect** (onboarding →
> `account.updated` gate on `payouts_enabled` → transfer on settle → backfill). Every
> provider is **config-gated and mock-by-default** — no money moves without
> operator-supplied keys. A money-flow **security review** closed two payment-integrity
> holes: **SEC-0007** (a direct admin refund left the worker's payout intact → double-pay)
> and **SEC-0008** (the same gap on the provider refund webhook), so both refund paths now
> reconcile the payout. Migrations are `0001`–`0038`. Go-live runbooks exist for all three:
> Stripe, PayPal, and Connect.
>
> **Note on earlier snapshots.** Sections 3–5 previously listed "a real payment-provider
> adapter" and "an interactive map picker" as open gaps. Both shipped (payments across
> slices 129–169; the map picker in 124 — a pure region helper + injected
> `react-native-maps` modal on native and a Google Maps JS picker on web). They have been
> removed from the gap list below.

## 1. Where we are in one sentence

The **marketplace engine is built, tested end-to-end, hardened for operation, live
on a hosted environment, and now wired for real money** — a customer can sign up,
post a repair request, get matched (admin assignment or a worker self-claiming by
category), receive and accept a worker's price quote, **pay for real via Stripe or
PayPal**, message the other party, and review the worker (and read the worker's
reply) — all persisted to Postgres, behind server-side authorization, and covered
by an extensive test suite. Accounts have a **full lifecycle** (change/forgot
password, log-out-everywhere, admin suspend/reinstate, self-delete); payments carry
a **marketplace commission split** and settle only through **signature-verified
provider webhooks**; **refunds are real** at both providers and **reconcile the
worker's payout** (SEC-0007/0008); and the worker's net is **really paid out over
Stripe Connect**. Every provider is **config-gated and mock-by-default**, so no
money moves until the operator supplies keys. Requests support **photo upload** and
an **interactive map picker**, chat threads **update live**, and each user controls
their **email/push notification preferences**, and the visit time is a **two-party
agreement** (propose → the other side confirms → either can reschedule). The **API and
the web app are both live on Railway, same-origin**, and the **Stripe half of the money
line has been proven against a real sandbox**, payouts included. We are at **internal
alpha, deployed**, and the main gaps to a real-user test build are now **QA and
operations, not engineering**: a PayPal sandbox dry run, a full E2E/device pass, and
production observability/backups.

## 2. What is done

**Foundation & quality.** TypeScript-strict monorepo (`shared` / `server` /
`app` logic / `app-expo` UI), ESLint + Prettier + typecheck + tests as enforced
quality gates, CI on every PR, a security-fix ledger (SEC-0002…SEC-0008), and
file-integrity checks. Disciplined one-slice-per-PR workflow (~169 feature slices,
many split into backend/app sub-slices, merged to `main`).

**Auth & identity.** Account **sign-up** (`POST /auth/register`) and JWT login
with scrypt-hashed passwords; `authenticate` on every protected route;
server-side authorization throughout (request parties, owner-only actions,
admin-only endpoints); auto sign-out on token expiry; rate limiting on the
unauthenticated auth endpoints. User profiles with display name, contact phone
(exposed only to a request's parties), worker **bio + specialties (skills)**, and
a worker **online/away availability** toggle.

**Account lifecycle (end-to-end, all merged).** Self-service **change password**
(re-verifies the current password) and **forgot-password** reset (single-use,
hashed, 1-hour token emailed via the config-gated sender). **Token revocation**: a
`token_version` claim embedded in each JWT lets "log out of all other devices" and
a password change invalidate every existing session while keeping the current
device signed in. **Admin suspend/reinstate** (a `users.status` of
active/suspended/deleted blocks sign-in and rejects live tokens immediately) via an
**admin Users management screen** (list every account with status, suspend or
reinstate per row). **Self-service account deletion** as a GDPR-friendly
**soft-delete/anonymize** — the row is kept (so foreign keys and de-identified
history stay intact) but email/name/phone/password are scrubbed, status set to
`deleted`, and all tokens revoked. Sensitive account actions are audited.

**Request lifecycle.** Create → match → accept → in_progress → completed, with a
guarded status state machine, cancellation (with reason), photos, a **preferred /
scheduled time**, a status/audit timeline (assigned-worker name snapshot),
keyword search, status filter, pagination (Load more), and pull-to-refresh.

**Matching.** Admin assignment **and** worker self-serve claiming of pending,
unassigned requests, with a **category/trade filter** on the available-requests
list and worker availability gating (an "away" worker sees no jobs). Both match
paths are **atomic** (a single conditional update), so two workers racing for the
same request can never both win. A worker can **release** an active job back to
the pool, and an admin can **force-reset** a stuck assignment back to pending for
reassignment. Request location can be auto-filled from the device's current
location, set via address → coordinates geocoding, or picked on an **interactive
map** (a `react-native-maps` modal on native; a Google Maps JS picker on web,
enabled by `EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY`), with a static-map thumbnail on the
request's Location.

**Quoting & payments.** The assigned worker proposes a price **quote** (amount +
note); the owning customer accepts or declines; payment is **gated server-side**
on an accepted quote of the matching amount. A US$1 minimum is enforced on quotes
and payments. Customers and workers each have a **payment history** view
(paid/received), and a **receipt** is derivable once a payment is paid.

**Real money — Stripe + PayPal (config-gated, mock by default).** We use a **Model B
marketplace split**: each payment is split at creation into a **platform commission**
(`PLATFORM_FEE_BPS`, default 15%) and the **worker's net**, surfaced in the app.
Payments record **which provider** took them (`payment.provider`) plus that provider's
own reference, so webhooks and refunds always route back correctly.

- **Stripe** — hosted Checkout: creating a payment opens a Checkout Session and returns
  a `checkoutUrl`; the app redirects; the payment settles **only** on the signed
  `checkout.session.completed` webhook (`POST /webhooks/stripe`, verified against
  `STRIPE_WEBHOOK_SECRET`).
- **PayPal** — Orders v2 (a second, coexisting method the customer picks at checkout;
  brings **Venmo** in the US for free): create order → buyer approves → **capture** →
  settle, with `POST /webhooks/paypal` (verified via PayPal's verify-webhook-signature
  API) as the backup that captures/settles an approved order whose buyer never returned.
- **Real refunds** at both providers (Stripe by PaymentIntent, PayPal by the stored
  capture id). If the provider refund fails, nothing is recorded.
- **Real payouts over Stripe Connect** — the worker onboards to an Express connected
  account from a **"Set up payouts"** button in the app; an `account.updated` webhook
  (`POST /webhooks/connect`) tracks `payouts_enabled`, and the platform only **transfers**
  their net once Stripe confirms the account can receive it, with a **backfill** that
  flushes payouts scheduled before onboarding finished.
- **Refund ↔ payout integrity (SEC-0007/0008).** Both refund paths — the admin action and
  the provider refund webhook — reconcile the worker's payout: a still-pending payout is
  removed (never double-pay), and an already-sent payout fails the admin refund closed
  (409, manual clawback) while the webhook still acknowledges.

The mock provider remains the default and the direct `/pay` endpoint is **disabled (409)**
for any payment a real provider took, so a payment can never be marked paid for free. All of
it is audited. **Going live is an operator step** (supply keys, point the dashboards'
webhooks at us): see `docs/stripe-go-live.md` and `docs/paypal-go-live.md`.

**Supporting domains, each backend + Postgres + app UI.** Reviews & worker
ratings (aggregated in SQL) **with a worker public reply**, in-app notifications
with unread badge, favorite workers, and an in-app message thread per request.
An **admin dashboard** surfaces aggregate stats (requests by status, paid totals,
worker count).

**Notification delivery.** Notifications fan out to email/push delivery channels
behind a `NotificationDelivery` interface, configured by `NOTIFY_CHANNELS`, with
per-channel failure isolation. **Real, config-gated senders exist**: an HTTP
email sender (Resend-shaped `{from,to,subject,text}` + Bearer) and an Expo push
sender that **surfaces per-ticket errors** (e.g. `DeviceNotRegistered`) even on an
HTTP 200. They send for real only when `EMAIL_*` / `PUSH_API_URL` are configured;
unconfigured channels stay inert (log only). Push **device tokens** are
registered from the app and stored in Postgres. Each user controls their own
**notification preferences** (email / push toggles in Profile, migration 0028): a
channel is delivered only when it is globally enabled **and** the recipient wants
it — enforced at the recipient-resolver layer, so an opted-out channel resolves to
"no recipient" and is skipped.

**Media & realtime.** Requests support **photo upload** — a provider-agnostic,
mock-by-default upload store (request an upload target → PUT the bytes → public
URL), an app image picker/upload helper, and a real `expo-image-picker` device
provider (with real S3 storage available behind `STORAGE_S3_*`). The in-app
**message thread is true-push over a WebSocket** — the server attaches a message
hub, `messageService` publishes to it, and the app consumes a live stream with
reconnect/backoff on both platforms; polling remains only as the fallback when no
stream is injected (e.g. tests).

**Persistence & DB hardening.** All domains (requests, audit, reviews,
notifications, users, favorites, messages, payments, quotes, device tokens,
payouts, certifications) run on Postgres via SQL migrations `0001`–`0036`, run
automatically on boot (a multi-statement-capable runner), with an in-memory fallback
for tests/dev. The schema is hardened with **indexes** on filtered columns (0016),
**CHECK constraints** enforcing the domain enums/ranges (0017), and **foreign keys**
across the graph (0018–0021, added `NOT VALID` so they enforce new writes without a
boot-time scan of legacy rows). Later migrations add `users.token_version` (0022),
`password_reset_tokens` (0023), `users.status` (0024), the payment
`platform_fee_cents` split (0025), the `refunded` payment status (0026), the
`payouts` table (0027), per-user `users.notify_email/notify_push` preferences (0028),
and the real-money columns: `payment.provider` (0033), `payment.capture_ref` (0034),
`users.stripe_account_id` (0035), `users.stripe_payouts_enabled` (0036), and the USD
re-denomination of every money row (0037).

**Apps.** Full three-role Expo React Native app: registration, login/session
persistence (SecureStore on native, localStorage on web), and role-specific
stacks for customer, worker, and admin, all wired to the API.

**Operational hardening & deploy.** Production CORS allowlist (SEC-0002); the
server refuses to boot in production with the default JWT secret (SEC-0004); demo
users are not seeded in production by default; a `GET /ready` readiness probe that
checks the database; structured per-request access logging with request-id
correlation; a dev-dependency-free production image (`tsc` build, no `tsx` at
runtime); deploy artifacts (`Dockerfile`, `.dockerignore`, `.env.example`,
deployment guide). **The API _and the web app_ are LIVE on Railway** (multi-stage
Docker build + managed Postgres plugin; `/health` and `/ready` green; migrations
applied on boot). The Docker build has a **`webbuild` stage** that exports the Expo
web bundle, and the runtime serves it **same-origin** via `WEB_DIST_DIR` (static
assets + an SPA fallback, mounted _after_ the API routes so it never shadows them).
Because it is same-origin, `CORS_ALLOWED_ORIGINS` can stay unset.
`EXPO_PUBLIC_API_BASE_URL` is a **required** build arg — the image build fails fast
without it, and because Expo inlines `EXPO_PUBLIC_*` at build time, changing it needs
a full rebuild, not a restart.

## 3. What a testable v1 still needs

> **`docs/go-live-checklist.md` is the operational list** — everything that must become true
> before a real user touches the app, with the blockers first. This section is the summary;
> that file is the one to work from.

These are the gaps between "deployed, feature-rich internal build" and "a build
real test users could exercise":

> ~~**Public frontend deploy.**~~ **Not a gap — this was stale and has been removed.**
> The web app is already built into the image (`webbuild` stage) and served
> **same-origin** by the API via `WEB_DIST_DIR`; the deployment is live. It does not
> need separate hosting, and `CORS_ALLOWED_ORIGINS` can stay unset. (This entry
> survived the slice-170 refresh by mistake and was corrected in 176.)

> ~~**Verify the deployed web app renders.**~~ **Done** — the deployed site was opened in a
> browser and drives the full loop (USD amounts render, login works). Kept out of the gap list
> for that reason; it stays in the QA checklist as a regression check.

> ~~**Stripe test-mode dry run.**~~ **Done, and it passed** — payments _and_ Connect payouts
> ran end to end against a Stripe sandbox, including the backfill. See the dry-run entry in
> §6. It found three defects CI could not (171, 172, 178).

1. **End-to-end + device QA.** Unit/integration coverage is strong (and a QA
   checklist exists at `docs/qa-checklist.md`); there is no full E2E run on a real
   device/build, nor accessibility/performance passes.
2. **Backups: the production database has no recovery story.** The runbook and the script
   are good (`docs/backups.md`, `scripts/backup-db.mjs`) — the earlier "no backup policy"
   gap was stale — but **nothing is switched on**, because the current Railway plan does
   not offer snapshots or PITR. Blocked, tracked in `docs/go-live-checklist.md`, and to be
   done **before any real user data lands in the database**. PITR first: its window is not
   retroactive, so enabling it the day it is needed is enabling it too late.
3. **Password reset sends no mail — but it is now purely an operator step.** `EMAIL_*` is
   unset, so the email channel falls back to the inert sender and a real user who forgets
   their password has no way back into their account. Slice 182 made this **configuration
   only**: the sender already matches Resend's API, a failure is now logged with the
   provider's reason instead of being swallowed, and `EMAIL_FROM` accepts the display-name
   form. Follow `docs/email-go-live.md`; the loop is not done until you have logged in with
   the new password.
4. **Observability.** The logs are now safe to ship (SEC-0009) and log shipping is
   documented (`docs/deployment.md`), but no drain is configured and there is no alerting.
   `/metrics` is **world-readable unless `METRICS_TOKEN` is set**, which `env.ts` does not
   require in production — it should, using the same `superRefine` pattern as SEC-0004/0009.
5. **PayPal sandbox dry run.** Stripe is now proven live; PayPal is not. The same class of
   defect the Stripe run exposed (things that only fail against a real provider) is still
   unexercised there. Follow `docs/paypal-go-live.md`.
6. **Payments go-live (operator step, not code).** The code is complete and
   config-gated; going live means supplying keys and pointing the providers'
   dashboard webhooks at us, following the runbooks — all three exist:
   `docs/stripe-go-live.md`, `docs/paypal-go-live.md`, and `docs/connect-go-live.md`
   (payouts). **Nothing in CI exercises a real provider**, which is precisely why the dry
   runs matter: the Stripe one found three defects that had passed every test we have.

## 4. How far to a testable v1

- **Internal alpha, deployed (reached).** Sign-up, full three-role loop, category
  matching, quoting, map picker, visit scheduling, real (config-gated) notification
  delivery, ops hardening, and a **live API + web app on Railway** (same-origin) — the
  team can exercise every flow against the hosted build, in a browser, today.
- **Payments-enabled (reached — and now _proven_, on Stripe).** Real Stripe + PayPal
  checkout, real refunds, and real Stripe Connect payouts are all built, tested, and
  reconciled (SEC-0007/0008). The **Stripe** line — charge, hosted checkout, signed webhook,
  settle, onboard, transfer, backfill — has been **run end to end against a live sandbox**
  and works. PayPal is built and unit-tested but has not yet met a real provider. Everything
  stays **mock-by-default**; flipping it on is an operator step with the runbooks.
- **Closed test (friendly users) — the next milestone.** The build is reachable and the
  money line is proven on Stripe. What remains is an **E2E/device QA** pass and the
  **PayPal sandbox** run.
- **Production-hardened.** API + web deployed with managed Postgres; remaining:
  observability/backups.

**Bottom line:** the hardest, riskiest parts — the domain model, authorization, the
state machine, concurrency, persistence, **real payments/refunds/payouts and their
integrity**, the three-role app loop, notification delivery, and a live same-origin
deployment — are **done, tested, and hardened**, and the Stripe money line is now proven
against a real provider rather than only against our own mocks. What stands between here
and a genuinely testable v1 is **QA and operations, not engineering**.

## 5. Recommended next slices (in order)

1. **PayPal sandbox dry run** (operator) — the other half of the money line, still
   unproven against a real provider: create → approve → capture → settle → refund. The
   Stripe run found three defects that every test we have had passed, so assume PayPal is
   hiding some too. Follow `docs/paypal-go-live.md`.
2. A full **E2E / device QA** pass against `docs/qa-checklist.md` (no run on a real
   device/build yet; no accessibility or performance pass).
3. **Backups & log shipping** for the Railway deployment — backups are **blocked on the
   Railway plan** (`docs/go-live-checklist.md`); log shipping is unblocked since SEC-0009 but
   not switched on. Structured 5xx logging and a Prometheus `/metrics` endpoint already exist,
   though `/metrics` is world-readable until `METRICS_TOKEN` is set.
4. ~~**Report the provider configuration at boot.**~~ **Done.** The server logs a "Provider
   configuration at boot" report — one line each for payments, the Stripe webhook, Connect payouts,
   PayPal, email, push, storage and metrics, each saying live vs. mock/inert and naming the unset
   variables (`server/src/config/providerReport.ts`). Finding out a provider is inert no longer
   needs a registration, a log hunt and a dashboard screenshot.

Beyond a testable v1, the obvious product gaps are **scheduling/booking windows** (requests
are matched immediately; there is a preferred time but no real calendar) and **feeding worker
ratings back into matching** (reviews are collected but do not influence ranking). The
**customer-facing dispute flow** that used to be listed here **shipped in slices 199–202**
(customer files a refund request → admin approves, reusing the existing refund line, or rejects
with a reason; UI on both ends, notifications, and audit).

Also shipped since the last snapshot: **Uber-style saved cards** (slices 193–198) — save a card via
a hosted setup Checkout and pay in-app off-session, settling on the `payment_intent.succeeded`
webhook.

## 6. Slice ledger since the last snapshot (110c–170)

- **110c–110e** payout backend + Postgres (migration 0027) + worker payout-history
  screen — **real-money mock flow complete** (split → webhook confirm → refund →
  payout).
- **111a–111c** image upload: mock store backend, app picker/upload logic + UI,
  real `expo-image-picker` provider — photo upload end-to-end (mock).
- **112** live-updating chat (message thread polls while open).
- **113a/113b** per-user notification preferences: backend (migration 0028;
  resolver layer honors the prefs) + email/push toggles in Profile.
- **114/114b** map picker: pure `initialMapRegion` helper + injected seam, then the
  real `react-native-maps` modal wired in `App.tsx` (native-only, hidden on web).
- **115a** payment provider seam + `providerRef` on each payment (migration 0029,
  mock provider); **115b** webhooks resolved by `providerRef`; **115c** raw-body
  **HMAC signature verification** for the payment/payout webhooks — the money flow
  is now shaped exactly like a real provider integration.
- **116** expanded audit: quote proposed/accepted/declined + payment created.
- **117** structured 5xx error logging (request id / method / path / stack;
  injectable sink) — merged.
- **118** database backup runbook (`docs/backups.md`) + `scripts/backup-db.mjs`
  (`npm run backup:db` — `pg_dump` wrapper; credentials passed via `PG*` env, never
  in argv/logs) — merged. Completes the observability/backups track.
- **119** end-to-end smoke test (`tests/e2e-smoke.test.mjs`) — the full three-role
  journey over HTTP driven by real demo logins (post → assign → quote → accept →
  pay w/ split → payout → message → complete → review → audit), plus a refreshed
  `docs/qa-checklist.md` covering payments/prefs/map/upload/observability — merged.
- **120** audit for auth/profile actions — `account.password_changed` (on
  change-password) and `profile.updated` (on profile edit, recording changed field
  **names** only, never values). AuditLogScreen labels + audit tests added —
  merged.
- **121a** storage-provider seam (`server/src/services/storageProvider.ts`:
  `StorageProvider` interface + inert `mockStorageProvider` + `selectStorageProvider`
  factory + singleton). `uploadService.createUploadTarget` now delegates through the
  seam and threads the image `contentType`; behavior unchanged (mock by default,
  serves bytes from memory). The seam a real S3/GCS presigned-URL adapter slots
  into — merged.
- **121b** real S3 storage provider (`createS3StorageProvider` via
  `@aws-sdk/client-s3` + `s3-request-presigner`) — config-gated on `STORAGE_S3_*`
  env (bucket/region/credentials, optional CDN base / S3-compatible endpoint /
  expiry). Returns a presigned PUT URL (client uploads directly) + the public
  object URL; the seam is now async; **mock still the default**. First real
  external SDK dependency (user-approved over hand-rolled SigV4) — merged.
- **122a** message pub/sub hub (`server/src/services/messageHub.ts`, in-process
  per-request subscribe/publish). `messageService.postMessage` publishes each saved
  message; the WebSocket layer (122b) will subscribe and push. No dependency, no
  transport yet — merged.
- **122b** WebSocket message push (`server/src/realtime/messageSocket.ts` via `ws`):
  a WebSocket server on `/ws/messages` authenticates the socket from a query
  `token` (same token\*version/active-account checks as HTTP), authorizes it with
  the same `isRequestParty` gate, subscribes to `messageHub`, and pushes each new
  message as JSON. Wired in `server.ts`. Adds the `ws` dependency (true push needs
  a WebSocket server; the standard lib can't). Polling remains as the fallback —
  merged.
- **122c** app live-chat logic: `app/src/features/messages/messageStream.ts`
  (injected `ConnectMessageStream` type + pure `mergeIncomingMessage` dedupe) and
  `MessagesScreen` `connectStream?` prop — when a stream is injected, pushed
  messages merge in real time and polling is skipped; absent, it falls back to
  polling. Native WebSocket provider wired in `App.tsx` is the follow-up (122d) —
  merged.
- **122d** native message-stream provider (`app-expo/src/messageStream.ts`):
  `deviceConnectMessageStream` opens the platform `WebSocket` to `/ws/messages`
  (API base http→ws + `getToken()` + requestId), forwards message frames, ignores
  the `ready` ack; wired into `App.tsx` `MessagesRoute`. No web stub needed
  (WebSocket is universal). Not unit-tested (native provider; 122c's injected fake
  covers the logic). Completes the **WebSocket realtime-chat track** (122a hub →
  122b server push → 122c app logic → 122d native provider) — merged.
- **123a** same-origin web hosting (`server/src/middlewares/webApp.ts`): when
  `WEB_DIST_DIR` points at the built Expo web export, Express serves the static
  assets + an SPA fallback (`text/html` navigations only) **after** the API routes,
  so it never shadows them (unknown API paths still 404 as JSON). Config-gated —
  unset in dev/test. `app.ts` wired; `.env.example` + `docs/deployment.md` updated.
  The app's API URL is already overridable via `EXPO_PUBLIC_API_BASE_URL` —
  merged.
- **123b** Dockerfile web-build stage: a `webbuild` stage runs `export:web` (with
  the required `EXPO_PUBLIC_API_BASE_URL` build arg, inlined at build time) and the
  runtime stage copies `app-expo/dist` in and sets `WEB_DIST_DIR`, so a single
  `docker build` produces one same-origin image (server + web). `.dockerignore`
  un-ignores `app`/`app-expo` (their `node_modules` still excluded); docs updated.
  Infra only — **validated: a local `docker build` succeeds (webbuild/export runs
  in-container) and `docker run` serves the login page same-origin on one port.** —
  merged.
- **124** web-export zod fix (blank web page): the shared code uses zod 4 APIs
  (`z.uuid()`), but the web bundle picked up app-expo's transitive **zod 3.x**, so
  `z.uuid()` threw and the app never rendered. Fix: pin **`zod ^4.4.3` directly in
  app-expo** (its only zod dependents — babel-plugin-react-compiler,
  eslint-plugin-react-hooks, zod-validation-error — all accept `^4`, so nothing
  needs v3), so the resolved version is correct regardless of Metro's fragile
  origin-based re-anchor; also made that re-anchor's path check
  separator/case-robust (`pathStartsWith`) and added `--clear` to `export:web` so a
  stale Metro cache can't mask a config/dep change. Needs `npm install` in app-expo
  — merged. Web app verified rendering + login locally at same-origin.
- **121c** app upload to S3: `apiClient.putUploadBytes` now attaches the bearer
  token only for a same-origin (relative) upload URL; an absolute presigned URL
  (S3) is left unauthenticated, since it's already signed and rejects an extra
  `Authorization` header. Fixes real S3 uploads from the app (mock upload path
  unchanged). Test added — merged. Completes the image-storage track end-to-end.
- **125** WebSocket reconnect + backoff: `createReconnectingStream` (pure,
  injectable timer/socket) wraps a socket opener with exponential backoff — a live
  open resets the delay, an unexpected close retries (base, 2×, 4×, … capped), and
  `close()` stops retrying and tears down the socket. The native provider uses it
  and does NOT retry terminal auth closes (4401/4403). Backoff logic unit-tested —
  merged.
- **126** Node 22 upgrade: `.nvmrc` 20→22, `engines` `>=20 <21`→`>=22` (also stops
  the `EBADENGINE` warnings on the dev's newer local Node), Dockerfile all three
  stages `node:22-slim`. CI reads `.nvmrc`, so the gates now run on Node 22 —
  clears the AWS SDK "requires node >=22 after early 2027" warning — merged.
- **127** map/location web compatibility: the address-search (`geocoder`) field is
  now hidden on web (`Platform.OS === 'web'`) — expo-location forward geocoding is
  native-only — matching the already-web-hidden map picker. Current location
  (browser geolocation) and manual entry remain; nothing crashes on web. QA
  checklist §8 documents the web degradation — merged.
- **128** API base URL normalization (`app-expo/src/config.ts`): a bare-domain
  `EXPO_PUBLIC_API_BASE_URL` (no scheme) now auto-gets `https://` and any trailing
  slash is dropped, so the deploy footgun that broke every request ("Could not
  reach the server") can't recur. Pure `normalizeApiBaseUrl` + jest tests — merged.
- **129** real Stripe payment provider (`createStripePaymentProvider` via the
  official `stripe` SDK): opens a PaymentIntent (amount in minor units, our ids in
  metadata, `idempotencyKey` = payment id) and returns `providerRef` = intent id +
  `clientSecret`. Config-gated on `STRIPE_SECRET_KEY` (`selectPaymentProvider`);
  **mock still the default**. The intent-creation seam is injectable, so the mapping
  is unit-tested offline with no Stripe network call. The webhook/HMAC confirmation
  (115b/c) already maps the intent id back — merged (deployed on Railway in **mock
  mode**, i.e. no `STRIPE_SECRET_KEY`, so the mock `/pay` is the intended behavior).
- **130a** Stripe wiring — backend (security + client secret). Closes two of the
  three 129 gaps: (a) `paymentService.createPayment` now returns the provider's
  `clientSecret` on the create response (ephemeral — added to `paymentSchema`
  optional, never persisted, never on a later GET); (c) **security fix:**
  `PaymentProvider.usesExternalCheckout` (mock=false, Stripe=true) + exported
  `assertDirectPayAllowed(provider)`, called at the top of `payPayment` — with a
  real provider the mock `/pay` now 409s, so a payment can be settled ONLY by the
  verified webhook (no more "mark paid for free"). Tests: provider flags +
  guard-throws-409. — merged.
- **130b** Stripe wiring — app checkout logic (gap b, logic half). Added the
  injected `PaymentCheckout` seam (`app/src/features/payments/checkout.ts`) +
  `RequestDetailScreen` `checkout?` prop: when the created payment carries a
  `clientSecret` and a checkout provider is injected, "Pay now" runs the provider
  checkout and refreshes (webhook settles); `failed` shows the message, `canceled`
  is a no-op; otherwise it falls back to the mock `/pay`. RNTL tests for the
  checkout success + failure paths — merged.
  **⚠️ Approach change:** for go-live we chose Stripe **hosted Checkout (redirect)**
  over an in-app PaymentSheet/Stripe.js — the backend opens a Checkout Session and
  the app just redirects the browser to Stripe's page, so no publishable key or
  card UI ships in the client. Split into 130c (backend Session), 130d (app
  redirect), 130e (webhook). The `clientSecret` seam from 130a/b still stands but is
  superseded by `checkoutUrl` from 130c onward.
- **130c** Stripe wiring — backend hosted Checkout (redirect). `paymentProvider`'s
  Stripe adapter now opens a **Checkout Session** instead of a PaymentIntent:
  `createStripePaymentProvider(createSession)` returns `providerRef` (the session's
  PaymentIntent id, falling back to the session id) + `checkoutUrl` (the hosted
  page); `stripeCheckoutCreator` calls `stripe.checkout.sessions.create` (mode
  `payment`, single line item, metadata + `payment_intent_data.metadata` carrying
  our `paymentId`/`requestId`, idempotent on the payment id). New env
  `STRIPE_CHECKOUT_SUCCESS_URL` / `STRIPE_CHECKOUT_CANCEL_URL` — **both required
  when `STRIPE_SECRET_KEY` is set**; `stripeConfigFromEnv` throws (500, fail-fast)
  otherwise. `PaymentChargeResult`/`paymentSchema` gain ephemeral `checkoutUrl`;
  `createPayment` threads it out (like `clientSecret` — never persisted). Provider
  tests rewritten for the Session signature (URL + PI-id mapping, session-id
  fallback, URL-omitted, external-checkout flag, select fails-fast without URLs).
  `.env.example` + `deployment.md` updated. Keep `STRIPE_SECRET_KEY` unset in
  production until 130d (app redirect) + 130e (webhook) land — merged.
- **130d** Stripe wiring — app redirect to hosted Checkout. The injected seam is now
  `OpenCheckout = (url) => Promise<void>` (`app/src/features/payments/checkout.ts`,
  replacing the `clientSecret`-based `PaymentCheckout`): when the created payment
  carries a `checkoutUrl` and an opener is injected, "Pay now" redirects the customer
  there and shows "Complete the payment in the page that opened, then return and
  refresh" — nothing marks it paid (the 130e webhook settles it); otherwise it falls
  back to the mock `/pay`. Real opener `deviceOpenCheckout`
  (`app-expo/src/checkout.ts`): web → `window.location.assign`, native →
  `Linking.openURL`; wired into `RequestDetailRoute` in `App.tsx`. RNTL tests updated
  for the redirect (opener called with the URL, mock `/pay` not used, notice shown)
  and the open-failure error path. Still keep `STRIPE_SECRET_KEY` unset until 130e —
  merged.
- **130e** Stripe wiring — signed webhook (settlement). New
  `stripeWebhookService.ts`: an injected `ConstructStripeEvent = (rawBody,
signature) => { type, paymentId }` (real `stripeEventConstructor` verifies the
  `Stripe-Signature` via `stripe.webhooks.constructEvent` — local, no network — and
  reads _our_ payment id from the session metadata), `selectStripeEventConstructor`
  (disabled unless `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are both set), and
  `handleStripeWebhook` which settles the payment idempotently on
  `checkout.session.completed` (via `confirmPaymentPaid` by our own id — no
  provider-ref ambiguity) and ignores everything else. New `POST /webhooks/stripe`
  (`postStripeWebhook`) reuses the raw-body capture; 404 when unconfigured, 400 on a
  missing signature, 401 on a bad one. New env `STRIPE_WEBHOOK_SECRET`. Tests: real
  constructor with a valid/invalid/`generateTestHeaderString` signature + metadata
  reduction, select-gating, and an e2e settle-idempotent / ignore-other-events pass.
  `.env.example` + `deployment.md` + go-live runbook updated. **Stripe flow is now
  complete (130c/d/e)** — go-live is an operator config step; keep the keys unset
  until then — _handed off_.

- **131** admin payout/financial overview: `AdminStats` gains a **Payouts** section
  — money owed to workers (`pendingPayout{sCount,AmountCents}`) vs. already paid out
  (`paidPayout{sCount,AmountCents}`). `payoutRepository.outstandingTotals()`
  aggregates by status (InMemory + a Postgres `FILTER` query); `statsService` feeds
  it; `AdminStatsScreen` renders it. Tests: admin-stats e2e (pending payout = worker
  net 127500), postgres-payout aggregate, AdminStatsScreen display — merged.

- **132** admin users search + filter: `filterAdminUsers` (pure — query on
  email/display name + optional role/status) in `app/src/features/admin/`, and
  `AdminUsersScreen` gains a search box + role/status filter chips applied client-
  side over the fetched list (empty state when nothing matches). Tests: pure filter
  cases + screen search/role narrowing — merged.

- **133** admin requests category filter: `GET /service-requests` now accepts a
  `category` query param (validated against `serviceCategorySchema`), filtered in
  `listServiceRequests`; `apiClient.listServiceRequests` + `useServiceRequestPage`
  thread it through; `AdminRequestsScreen` adds the existing `CategoryFilter` chips
  (status + keyword search were already there). Tests: server list category filter
  (+ invalid→422) and the screen passing the chosen category to the query — merged.

- **134** audit for auth security actions: `account.sessions_revoked` (on
  `logout-all`) and `device.registered` (on push-token registration, actor + user
  id only — the **raw token is never recorded**). `authService.logoutAllDevices`
  and `deviceTokenService.registerDeviceToken` record the events; AuditLogScreen
  labels added; audit tests cover both (+ assert the token isn't in the event) —
  _in review_.
- **135** UI design system — round 1 (visual/layout only, no API/schema/behavior
  change). New `app-expo/src/theme.ts` tokens (repair-green brand `#167A5A`,
  graphite ink, coral accent, warm-gold + soft status tints; `radii`, `spacing`,
  `shadow`); new reusable `StatusBadge` (status→tinted uppercase badge, + test);
  restyled `SearchBox`/`StatusFilter`/`CategoryFilter`/`AlertsButton`; redesigned
  `Login`, `ServiceRequests`, `WorkerJobs`, `AvailableJobs`, `AdminStats`,
  `RequestDetail` (quote/payment/review as work sections); `App.tsx` navigation
  theming + desktop max-width / mobile wrapping. Verified on desktop + 390×844 (no
  overflow/overlap); root 650/650 + app-expo 137/137 green. Next round: Profile,
  Messages, Payments, Notifications, Register — merged.
- **136** UI design system — round 2 (visual/layout only, no API/schema/behavior
  change; every `accessibilityLabel`, `testID`, and rendered string preserved).
  Rolled the `theme.ts` tokens into the five remaining screens: `Notifications` and
  `Payments` lists become centered (`maxWidth 760`) token-styled cards (brand-soft
  tint for unread), `Messages` bubbles/composer/send use brand + surface tokens,
  `Profile` fully re-tokened (brand chips/role, brand-outline "log out other
  devices", danger-token delete) with a `maxWidth 640` column, and `Register` gets
  the `Login` shell+card treatment (eyebrow, form card, brand role toggles). All
  hardcoded slate/blue hexes removed in favor of tokens. Visual QA (desktop +
  narrow) is a reviewer step — merged.
- **137** Stripe hosted-checkout **E2E regression** (test-only + a small seam). New
  `tests/stripe-checkout-e2e.test.mjs` drives the whole external-checkout branch over
  the real HTTP API: a fake external provider is injected, so create returns a
  `checkoutUrl` (and never a `clientSecret`), the mock `/pay` is blocked (409), and a
  genuinely-signed `checkout.session.completed` delivered to the real
  `/webhooks/stripe` is the only thing that settles the payment and schedules the
  worker payout — idempotently — plus a bad-signature → 401 case. To make the
  provider swappable without touching prod behavior, `paymentService` gained
  `setPaymentProviderForTests` / `resetPaymentProviderForTests` (mirrors the existing
  `resetX` test-support exports; `createPayment` / `payPayment` now read the active
  provider). The override is anchored on `globalThis` (not a module-local `let`) so a
  tsx double-loaded `paymentService` can't hide the injection from the request path —
  a follow-up CI fix after the first form failed exactly that way. No product behavior
  change — merged.
- **138** ship-ready structured JSON logging (ops runbook). `utils/logger.ts` now
  writes **one self-contained JSON object per line** (`{ level, time, msg, ...fields }`)
  in the default `LOG_FORMAT=json`, so a log drain parses each line and indexes the
  fields with no prefix to strip; `LOG_FORMAT=pretty` gives a compact human line for
  local dev. `logger.info/error(message, fields?)` gained an optional structured
  fields arg; the request-logger and error-handler default sinks now pass their
  whitelisted fields (`type:"request"|"error"`, correlated by `requestId`) instead of
  a pre-`JSON.stringify`-ed string. New `LOG_FORMAT` env (validated; logger reads the
  raw var to stay dependency-free). `.env.example` + `deployment.md` document it and
  add a **log-shipping** section (Railway Log Drain → Logtail/Datadog/Axiom); also
  repaired `deployment.md`'s truncated tail. Tests: `logger.test.mjs` (json line is
  pure parseable JSON with an ISO `time`, error→stderr not stdout, pretty format).
  The whitelist (never body/headers/query) is unchanged — merged.
- **139** payment receipts (backend + client). New `receiptSchema` / `Receipt` and
  `buildPaymentReceipt(requestId, principal)` in `paymentService`: derives a
  self-contained receipt from a **paid** payment — amount breakdown (gross, platform
  fee, worker net), currency, request category/description, both parties' display
  names, provider ref, and a deterministic `receiptNumber` (`HF-<YYYYMMDD>-<id8>`).
  Same authorization as `getPayment` (any request party), 409 before the payment is
  paid, 404 when there's no payment. New `GET /service-requests/:id/payment/receipt`
  (`getServiceRequestPaymentReceipt`) + `apiClient.getPaymentReceipt`. Nothing new is
  persisted (built on the fly). Tests: server e2e (fields + breakdown, party/admin
  access, 409-before-paid, 403 non-party, 404 no-payment, deterministic number) and
  an api-client e2e. Followed by the app surface (139b) — merged.
- **139b** app receipt view (RequestDetail). When a payment is **paid**, the payment
  section shows a brand-outline **"View receipt"** button (visible to any party); it
  calls `apiClient.getPaymentReceipt` and renders a receipt card — number, issued
  date, amount-paid / platform-fee / worker-net rows, and a
  `customer → worker · category` line. Errors surface inline; theme-tokened, no API
  or schema change. RNTL test covers the paid → view → card-rendered flow — merged.
- **140** Prometheus `/metrics` endpoint + collection (monitoring). New dependency-
  free `metrics/registry.ts` (a `MetricsRegistry` rendering Prometheus text) +
  `createMetricsMiddleware` that records every request on finish/close:
  `homefix_http_requests_total{method,status}` (labeled by method + status **only** —
  never the path, so cardinality stays bounded), request-duration sum/count, an
  in-flight gauge, and `process_uptime_seconds` / `process_resident_memory_bytes`.
  `GET /metrics` serves it; new optional `METRICS_TOKEN` gates it (Bearer required
  when set, open when unset — dev/trusted network). The registry singleton is
  anchored on `globalThis` (the slice-137 lesson) so a tsx double-load can't split
  the middleware's writes from the route's reads. `.env.example` + `deployment.md`
  document it. Tests: counter/format/process-gauges present, counter increments with
  traffic, and the token gate (401 without / 200 with / 401 wrong) — merged.
- **141a** service-request address field (backend + migration). Requests can now carry
  an optional human-readable `address` alongside the canonical coordinates — the
  geocoder already produces a label (previously discarded), and coordinates stay the
  value used for matching/maps. Added `address` (optional, 1–300 chars) to
  `createServiceRequestInputSchema` + `serviceRequestSchema`; `createServiceRequest`
  threads it; the Postgres repo persists it (new column in UPSERT/SELECT/row/mapRow,
  nullable) via migration `0030_service_request_address`; the in-memory repo needs no
  change (it stores the whole object). Tests: PGlite round-trip (present + omitted)
  and an HTTP create/get (stored + returned, omitted when absent, empty → 422). Next:
  141b wires the app to capture the geocode label and display `address` + an
  "Open in Maps" link instead of raw coordinates — merged.
- **141b** app: show address + "Open in Maps" (no more raw coordinates on screen).
  `CreateRequestScreen` captures the chosen address-search label into an `address`
  state and sends it on create — cleared whenever coordinates are set another way
  (manual edit, current location, map pin), which carry no label. `RequestDetail`
  now shows `request.address` (falling back to formatted coordinates only when
  absent) plus an **"Open in Maps"** link that opens a universal Google Maps URL for
  the coordinates via `Linking.openURL`. New pure `app/src/features/location/
mapsLink.ts` (`mapsUrl(coords)`). Tests: `maps-link` unit (URL shape, encoding),
  RequestDetail (address shown + Maps opened with the right URL), CreateRequest
  (chosen address submitted). Coordinates remain the canonical stored value — merged.

### Worker certifications (credential-gated matching) — feature 142

Goal: a worker's specialties are backed by admin-verified credentials, and only a
**verified** certification for a category unlocks that category's jobs. Phased:
142a (data + worker upload) → 142b (admin review) → 142c (matching gate) → 142d (app).

- **142a** certification data model + worker upload/list (backend). New
  `certificationSchema` (`{ id, workerId, category, title, documentUrl, status:
pending|verified|rejected, createdAt, reviewedAt?, reviewerId?, rejectionReason? }`)
  - `createCertificationInputSchema` + list; three new audit actions
    (`certification.submitted|verified|rejected`, labeled in `AuditLogScreen`). New
    `certificationRepository` (interface / InMemory / Postgres / factory) + migration
    `0031_certifications` (FK worker/reviewer → users, status CHECK, indexes on
    worker\*id/status). `certificationService.addCertification` (worker-only, starts
    `pending`, audited) + `listMyCertifications`; `POST` / `GET /certifications` wired.
    The document is uploaded via the existing upload seam; the cert stores only its
    URL. Tests: HTTP (submit→pending, list own, customer 403, invalid→422) + PGlite
    round-trip (find by worker/status, review upsert, rejection reason). Not yet gating
    anything — that's 142c — merged.
- **142b** admin certification review. `reviewCertificationInputSchema`
  (`decision: verify|reject`, `reason?`). `certificationService`:
  `listCertificationsByStatus` (admin, defaults to the `pending` queue) and
  `reviewCertification` — admin-only, only a `pending` cert is reviewable (**409**
  otherwise), a rejection **requires a reason** (422 without), sets
  `reviewedAt`/`reviewerId` (+ `rejectionReason`), notifies the worker, and audits
  `certification.verified`/`rejected`. New `GET /admin/certifications?status=` and
  `POST /certifications/:id/review`. Tests: pending queue (worker 403), verify +
  409-on-re-review, reject-needs-reason, non-admin 403 / invalid decision 422, 404
  unknown. Still no matching gate — that's 142c — merged.
- **142c** credential-gated matching (security-sensitive). A worker now only
  **sees** (`listAvailableRequests`) and can **claim** (`claimRequest`) jobs in
  categories they hold a **verified** certification for; `claimRequest` throws 403
  before the atomic claim otherwise. Helpers `verifiedCategoriesForWorker` +
  `assertWorkerCertifiedFor` in `serviceRequestService` (reads the cert repo).
  **Admin assignment stays an ungated trusted override** (like reset/refund), so
  existing admin-assign flows are unaffected. New shared test fixture
  `certification-fixtures.mjs` (`seedVerifiedCertification` via the real submit +
  admin-verify API); the self-serve tests (claim/available/release/reset/billing)
  seed a verified plumbing cert for the worker(s) they use. New
  `certification-gating.test.mjs`: no-cert → hidden + claim 403; pending/rejected
  cert stays gated; verified → visible + claimable; a cert in one category doesn't
  unlock another; admin can still assign an uncertified worker. — merged.
- **142d** worker certifications app screen. `apiClient` gained `listMyCertifications`
  - `submitCertification`. New `CertificationsScreen`: lists the worker's own
    certifications with status pills (pending=gold, verified=brand, rejected=danger,
    with the reason) and an add form — category chips, title, and a document upload
    (reuses the injected `imagePicker` + `uploadPickedImage`, so the certificate is
    stored via the existing upload seam and the cert holds only its URL). Wired into
    the worker stack (`App.tsx`) with a "Certifications" entry on `WorkerJobs`. A worker
    who just registered lands here to add credentials before any jobs open up. RNTL
    tests: list + statuses/reason, validation (category+title+document required),
    upload→submit happy path. Next: 142e admin review screen — merged.
- **142e** admin certification review screen (completes feature 142). `apiClient`
  gained `listAdminCertifications(status='pending')` + `reviewCertification(id,
decision, reason?)`. New `AdminCertificationsScreen`: the pending queue, each card
  with the title/category, a "View document" link (`Linking.openURL`), a reason field,
  and Verify / Reject actions (reject requires a reason; a reviewed card drops out of
  the queue). Wired into the admin stack with a "Certifications" entry on
  `AdminRequests`. RNTL tests: verify-removes, reject-needs-reason, reject-with-reason.
  **Feature 142 (credential-gated matching) is now end-to-end**: worker uploads →
  admin verifies → only verified categories unlock self-serve jobs — merged.
- **143** Location static map thumbnail (Google). Industry-standard pattern: a
  lightweight static-map preview that opens the full interactive map on tap. New pure
  `googleStaticMapUrl(location, apiKey)` (app/) builds a Google Static Maps URL
  (centered, brand-colored marker); `app-expo/src/staticMap.ts`
  `staticMapPreviewUrl(location)` reads `EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY` and
  returns null when unset. `RequestDetail` Location now renders a tappable `<Image>`
  thumbnail (tap → interactive Google Maps via `mapsUrl` + `Linking`) above the
  existing "Open in Maps" link — via an injected `mapPreviewUrl` prop (default = the
  config wrapper) so it's testable without the build-time env. Config-gated: no key →
  no thumbnail, just the text + link (no broken image). `app-expo/.env.example`
  documents the key. Tests: `googleStaticMapUrl` URL shape; RequestDetail
  preview-shown-and-tappable + preview-absent — merged.
- **144** fix cancel-after-paid (**SEC-0006**, payment-integrity). A paid request
  could still be cancelled, orphaning the settled payment (no refund flow) — the
  cancel path never checked payment status. Same class as SEC-0005: reused the
  existing `assertNotPaid` guard — `updateServiceRequestStatus` now calls it before a
  `→ cancelled` transition (422 on a `paid` payment, for customer or admin), and the
  guard message was generalized to "cancelled, released, or reset". The app hides the
  cancel control when the payment is paid (`RequestDetailScreen`); the server check is
  authoritative. New `tests/cancel-paid-guard.test.mjs` (paid → 422 + payment
  preserved; unpaid → cancels). Ledger entry SEC-0006 (related SEC-0005). Refund-then-
  cancel stays a separate future capability — merged.
- **145** admin "cancel + refund" (the deliberate counterpart to SEC-0006). New
  `POST /service-requests/:id/cancel` (admin-only): if the request has a `paid`
  payment it reverses the worker's still-pending payout and refunds the payment
  (`paid → refunded`, audited), then cancels — so the SEC-0006 guard no longer blocks
  it and no money is orphaned. A payout that was already settled to the worker returns
  **409** (manual clawback). Unpaid requests just cancel. New standalone
  `adminCancelService` orchestrates payment + payout + request without adding an import
  cycle; `payoutService.reversePendingPayout` + `payoutRepository.deleteByPayment`
  (in-memory + Postgres). **App**: RequestDetail shows an admin-only "Cancel job &
  refund" control (reason optional) when the payment is `paid` and the request is not
  terminal; `apiClient.adminCancelWithRefund`. Tests: server
  `tests/admin-cancel-refund.test.mjs` (refund + payout reversed + cancelled; non-admin
  403; unpaid cancels; already-paid-out 409) and app
  `RequestDetailScreen.test.tsx` (admin sees + cancels with/without reason; hidden when
  unpaid; hidden from non-admin) — merged.
- **146** wire the Google Static Maps key into the web build. The 143 thumbnail code
  reads `EXPO_PUBLIC_GOOGLE_MAPS_STATIC_KEY`, but the Docker web build never passed it,
  so the deployed bundle could never show a real thumbnail (Expo inlines
  `EXPO_PUBLIC_*` at build time). Added an **optional** `ARG`/`ENV` in the web build
  stage (no fail-fast gate, unlike the required API URL) + documented the Google Cloud
  lockdown (HTTP-referrer restriction + Maps Static API only) in `docs/deployment.md`.
  No app/server code — merged.
- **147** static-map thumbnails on the request lists. New reusable
  `components/RequestLocationThumbnail` (injectable `mapPreviewUrl` seam, defaults to
  `staticMapPreviewUrl`) renders a small map image on each list card, and **nothing**
  when no key is configured (no broken image), so lists stay clean until the key is
  set. Wired into the customer list (`ServiceRequestsScreen`), the worker available-jobs
  list (`AvailableJobsScreen`), and the admin list (`AdminRequestsScreen`); the card's
  own tap still opens the detail screen with the interactive map. Test
  `RequestLocationThumbnail.test.tsx` (renders the image with the URL; renders nothing
  when null; passes the location to the builder) — merged.
- **148** interactive "Pick on map" on **web** (drag a pin to set the exact location).
  The draggable-pin picker already existed on native (`mapPicker.tsx`, react-native-maps
  Marker `draggable` + tap-to-place); web was a stub and App hid the button. Implemented
  `mapPicker.web.tsx` with the Google Maps JavaScript SDK (loaded once from a `<script>`,
  minimal local typings — no `@types/google.maps` dep): a modal host with a draggable
  marker + tap-to-move, Cancel / "Use this location", resolving through the existing
  `MapPicker` seam. Gated by the optional `EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY`; both picker
  modules now export `mapPickerAvailable` (native = always, web = key present) and
  App.tsx shows the button via that flag instead of a `Platform.OS` check. Wired the key
  as an optional Docker build `ARG` + documented the Google Cloud setup
  (`docs/deployment.md`, `app-expo/.env.example`). The picker is browser-SDK glue
  (mirrors the untested native host); the tested logic — `initialMapRegion` and
  `CreateRequestScreen`'s `pickOnMap` via an injected fake — is unchanged and still
  covered. Verify on the deployed web build once the JS key is set — merged.
- **149** audit **login** and **registration** (closing the last auth-audit gaps; the
  rest — password change, sessions revoked, profile update, account
  delete/suspend/reinstate — were already covered). Added `account.logged_in` (on a
  successful `login`) and `account.registered` (on `registerUser`) to `auditActionSchema`
  and `authService`; actor = the signing-in / new user, resource = their id, no
  credentials in the event. Tests in `tests/audit.test.mjs` (login → event with the
  user as actor/resource; register → self-actor event with no email/password). Failed
  logins remain unaudited (would need a nullable-actor schema) — merged.
- **150** refresh `docs/qa-checklist.md` to match the current app (it had drifted). Fixed
  the stale "map picker hidden on web" claim (148 added a web Google Maps JS picker),
  added the **certifications** credential-gating flow (new §16: worker upload → admin
  review → verified-only claim, plus the admin trusted-override), the **paid-cancel
  guard** (SEC-0006) and admin **cancel + refund** (§11), the **receipt** view and list
  **map thumbnails** (customer §2), `/metrics` (§14), login/registration audit events
  (§4), and the migration range (`0001`–`0031`). Docs only — merged.
- **151** audit **failed logins** (nullable-actor audit). Made `actorId` / `actorRole` /
  `resourceId` optional on `auditEventSchema` + `recordAuditEvent` + the Postgres repo,
  with migration `0032` dropping their `NOT NULL` (the actor FK still holds — a NULL
  satisfies it). `authService.login` now records `account.login_failed` in every failure
  branch: a known account is attributed (actor + resource = that user, so repeated
  failures correlate); an unknown email is actor-less. A `details.reason` code
  (`unknown_account` / `invalid_password` / `suspended` / `inactive`) is stored — never
  the attempted email or password. App audit log labels it "Failed sign-in" and renders
  an absent actor as "anonymous". Tests in `tests/audit.test.mjs` (known → attributed
  with reason; unknown → actor-less, no email). Completes auth-audit coverage — merged.
- **152** Stripe go-live runbook (`docs/stripe-go-live.md`). No code — the hosted-Checkout
  flow (129/130c–e) is already go-live ready; this is the sequenced **operator**
  procedure grounded in the code: how the keys switch the provider on (mock `/pay`
  disabled → settlement only via the signed `checkout.session.completed` webhook), the
  required env, creating the dashboard webhook, a **test-mode dry run** with a test card
  (verify settlement + payout + cancel + the 409 on direct pay), the **live** switch, and
  a **rollback** (unset `STRIPE_SECRET_KEY` → reverts to mock). Linked from
  `deployment.md`. Keys and real payments are the operator's to run — _handed off_.
- **153** payment-provider coexistence core (PayPal groundwork, **slice A** of the
  add-PayPal plan). A payment now records **which** provider took it: new
  `paymentProviderIdSchema` (mock/stripe/paypal) + `payment.provider` (optional) +
  migration `0033` (nullable column + CHECK); the `PaymentProvider` interface gains an
  `id`. The customer's `method` (`card`/`paypal`, new `paymentMethodSchema`, optional on
  `createPaymentInputSchema`) selects the provider via `selectPaymentProviderForMethod` —
  `card`/unspecified → the configured card provider (Stripe or mock), `paypal` → **400
  until the adapter is wired** (slice B), so it never silently charges elsewhere. The
  globalThis test-override still wins, so existing provider tests are untouched. Tests:
  `tests/payment-method.test.mjs` (mock recorded; card→mock; paypal→400 + no payment) +
  `selectPaymentProviderForMethod` unit cases. Backend/shared only — merged.
- **154** PayPal Orders adapter (**slice B**). `createPaypalPaymentProvider(createOrder)`
  behind the same seam as Stripe (`id: 'paypal'`, `usesExternalCheckout`): `createCharge`
  opens an order and returns the buyer-approval URL + order id (our `providerRef`), with
  our `paymentId` on the order as `custom_id` so the capture webhook can map back. The
  real `paypalOrderCreator(config)` (OAuth2 client-credentials → `POST /v2/checkout/orders`
  intent CAPTURE) is injected like Stripe's session creator, so it's testable via a fake
  (no network in tests). Config-gated: env `PAYPAL_CLIENT_ID/SECRET/RETURN_URL/CANCEL_URL/ENV`
  (sandbox|live) → `paypalConfigFromEnv`; `selectPaymentProviderForMethod('paypal')` now
  returns the real provider when configured, else 400. Tests: `createPaypalPaymentProvider`
  (approval URL mapped; omitted when absent; ids in metadata). **Not functional yet** — the
  **capture + `/webhooks/paypal` settlement is slice C**; until then an approved order
  never settles (payment stays pending; no money moves without capture), and the app won't
  offer PayPal until the method picker (slice D). Do NOT set `PAYPAL_*` in prod until C.
  Backend/shared only — merged.
- **155** PayPal capture settlement (**slice C**) — PayPal can now actually charge.
  `paypalOrderCapturer(config)` (OAuth → `POST /v2/checkout/orders/{id}/capture`) +
  `selectPaypalCapturer`; `paymentService.capturePaypalPayment(requestId, principal)`
  loads the payment, checks the owning customer + `provider === 'paypal'`, captures the
  stored order (`providerRef`), and settles via `confirmPaymentPaid` **only on a COMPLETED
  capture** (idempotent; 402 otherwise) — so a payment is never marked paid without PayPal
  charging the buyer. New `POST /service-requests/:id/payment/paypal/capture` (owning
  customer). **Payment-integrity hardening**: the mock `/pay` now also 409s for any payment
  whose stored `provider` is external (`stripe`/`paypal`), closing a free-pay gap when
  PayPal is configured but Stripe is not (the old guard only checked the globally-active
  provider). Capturer has a globalThis test-override like the provider one. Tests
  `tests/paypal-capture.test.mjs` (capture → paid + payout; non-owner 403; non-PayPal 409;
  non-COMPLETED 402 + still pending; `/pay` on a PayPal payment 409). **Remaining: `/webhooks/paypal`
  as a robustness backup for interrupted returns (C2), then the app method picker + return
  handling (D).** Backend only — merged.
- **156** app PayPal checkout (**slice D**) — PayPal is now usable end-to-end in the app.
  `apiClient.createPayment(id, amount, method?)` + `capturePaypalPayment(id)`. RequestDetail
  shows a **Card / PayPal** method picker (gated by `EXPO_PUBLIC_PAYPAL_ENABLED`, wired as an
  optional Docker build arg + `.env.example`); `setupPayment` sends `method: 'paypal'` (card
  keeps the 2-arg call); the pay button is provider-aware — `Pay with PayPal` (redirects via
  the existing `openCheckout` while a checkout URL is present) then `Complete PayPal payment`
  on return (calls `capturePaypalPayment`), while non-PayPal stays `Pay now`. Tests in
  `RequestDetailScreen.test.tsx` (picker → `createPayment(…, 'paypal')` + redirect; returned
  payment → capture → Paid; picker hidden when disabled). **PayPal happy path now works
  end-to-end for sandbox testing.** Remaining: `/webhooks/paypal` robustness backup (C2) for
  interrupted returns, and a PayPal go-live runbook. — merged.
- **157** PayPal go-live runbook (`docs/paypal-go-live.md`). No code — the operator
  procedure for the A–D PayPal flow: how the creds switch it on (mock/card unaffected;
  settlement is create → approve → **return + capture**, not auto like Stripe; mock `/pay`
  409s for PayPal), the required env (`PAYPAL_CLIENT_ID/SECRET/RETURN_URL/CANCEL_URL/ENV`
  - `EXPO_PUBLIC_PAYPAL_ENABLED`), creating a sandbox REST app, a **sandbox dry run** with a
    sandbox buyer, the live switch, and rollback. Notes the interrupted-return limitation
    (until the `/webhooks/paypal` backup lands), Venmo (US, eligibility-gated, no code), and
    the currency/zero-decimal caveat. Linked from `deployment.md` (which now also lists the
    `PAYPAL_*` env). — merged.
- **158** PayPal webhook backup (**C2**) — settles an interrupted return out-of-band.
  New `POST /webhooks/paypal`, disabled (404) unless the credentials + `PAYPAL_WEBHOOK_ID`
  are set; each delivery is verified via PayPal's **verify-webhook-signature** API
  (injected `VerifyPaypalWebhook` seam with a globalThis test override; real verifier in
  `paymentProvider`). `handlePaypalWebhook`: `PAYMENT.CAPTURE.COMPLETED` → settle by the
  order's `custom_id`; `CHECKOUT.ORDER.APPROVED` → `settlePaypalOrderById` captures the
  order server-side and settles (the buyer-approved-but-never-returned case). All
  idempotent; unrelated event types are acked (200) with no effect. Tests
  `tests/paypal-webhook.test.mjs` (capture-completed → paid; approved → captured + paid;
  bad signature 401; unrelated type 200 no-op; unconfigured 404). Runbook + deployment env
  updated (`PAYPAL_WEBHOOK_ID`, webhook creation step). **PayPal line A–D + C2 complete.**
  Backend only — merged.
- **159** worker earnings summary (backend, **slice A** of the earnings dashboard). New
  `GET /payouts/summary` (worker-only, 403 otherwise) → `earningsSummarySchema`
  (`pendingCount`/`pendingAmountCents`/`paidCount`/`paidAmountCents`, the worker's net in
  minor units). `payoutRepository.workerTotals(workerId)` (in-memory + Postgres, mirrors
  `outstandingTotals` filtered by worker) + `payoutService.myEarnings`. Tests
  `tests/worker-earnings.test.mjs` (paid + pending split; zeros for none; non-worker 403).
  **App dashboard card is slice B.** Backend/shared only — merged.
- **160** worker earnings card (**slice B**, app). `apiClient.getMyEarnings()` →
  `GET /payouts/summary`. `PayoutsScreen` fetches the summary **best-effort** (the list
  still renders if it fails, so older clients/tests are unaffected) and shows a header card
  with **Paid out** / **Pending** totals + counts above the payout list. Test in
  `PayoutsScreen.test.tsx` (card renders the totals). app-expo + `app/` apiClient only —
  merged.
- **161** real **Stripe refunds** (**slice A** of real refunds). New `RefundCharge` seam +
  `stripeRefunder` (`stripe.refunds.create({ payment_intent: providerRef })`) +
  `selectStripeRefunder` (config-gated on `STRIPE_SECRET_KEY`), with a globalThis test
  override. `refundPayment` now, for a `provider === 'stripe'` payment, **reverses the
  charge at Stripe first** (by the stored PaymentIntent `providerRef`) and only then marks
  it refunded — if the provider refund throws, nothing is recorded (payment stays paid).
  Mock payments still just flip status; **PayPal real refunds are a follow-up** (they need
  the capture id, which isn't stored yet). Tests `tests/stripe-refund.test.mjs` (Stripe
  charge reversed by providerRef → refunded; refund failure → stays paid). Backend only —
  merged.
- **162** real **PayPal refunds** (**slice B** of real refunds). PayPal refunds are on the
  **capture** id, not the order — so the capture id is now stored: `PaypalCaptureResult`
  gains `captureId`, and `capturePaypalPayment` / `settlePaypalOrderById` persist it as
  `payment.captureRef` (new optional field + migration `0034`) before settling. `refundPayment`
  now, for a `provider === 'paypal'` payment, refunds the capture at PayPal
  (`POST /v2/payments/captures/{captureRef}/refund` via `paypalRefunder` /
  `selectPaypalRefunder`, globalThis override) before marking refunded — throw → nothing
  recorded. Tests `tests/paypal-refund.test.mjs` (capture stored → refund by captureRef →
  refunded; refund failure → stays paid). **Real refunds now cover both providers**; only
  real payouts remain mock. Backend/shared only — merged.
- **163** Stripe Connect worker onboarding (**slice A** of real payouts). Workers get a
  `stripeAccountId` (nullable, `UserRecord` + both repos + migration `0035`; cleared on
  anonymize, carried through a profile edit). New `POST /me/connect/onboard` (worker-only,
  403 else; 400 when payouts aren't configured) creates/reuses the worker's Stripe **Express**
  connected account and returns the hosted onboarding URL (`connectOnboardingSchema`). Seam:
  `CreateConnectOnboarding` + `stripeConnectOnboarder` (`accounts.create` → `accountLinks.create`)
  - `selectConnectOnboarder` (config-gated on `STRIPE_SECRET_KEY` + `STRIPE_CONNECT_RETURN_URL`
    / `STRIPE_CONNECT_REFRESH_URL`), with a globalThis test override in `connectService`. Tests
    `tests/connect-onboarding.test.mjs` (account created + id stored + reused on a second call;
    non-worker 403; unconfigured 400). **Next: the payout sender (transfer to the connected
    account) + the `account.updated` webhook + the app onboarding button.** Backend/shared only
    — merged.
- **164** Connect payout transfers (**slice B** of real payouts). When a payment settles and
  schedules the worker's pending payout, `createPayoutForPayment` now sends it **best-effort**:
  `SendPayout` seam + `stripePayoutSender` (`stripe.transfers.create({ destination: acct })`) +
  `selectPayoutSender` (config-gated on `STRIPE_SECRET_KEY`, globalThis override in
  `payoutService`). `tryTransferPayout` is a no-op unless payouts are configured **and** the
  worker has onboarded (`stripeAccountId`); on success it settles the payout
  (`confirmPayoutPaid`), on failure it leaves it pending (retriable) and never disturbs the
  payment settlement. Tests `tests/connect-payout.test.mjs` (onboarded → transferred to the
  account + settled; not onboarded → pending; transfer fails → pending). Backend only —
  merged.
- **165** worker payout onboarding button (**slice D**, app). `apiClient.startConnectOnboarding()`
  → `POST /me/connect/onboard`. `PayoutsScreen` shows a **"Set up payouts"** button (gated by
  `EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED`, wired as an optional Docker build arg + `.env.example`;
  reachable in both the empty state and the list) that starts onboarding and redirects to the
  hosted URL via the existing `openCheckout` seam (wired in `App.tsx`). Test in
  `PayoutsScreen.test.tsx` (button → `startConnectOnboarding` + redirect; hidden when disabled).
  **Real payouts are now usable end-to-end** (worker onboards → future payments transfer to
  their account). Remaining hardening: `account.updated` webhook + a backfill for payouts
  scheduled before onboarding. app-expo + `app/` apiClient — merged.
- **166** Connect `account.updated` webhook (**payout hardening**). New
  `POST /webhooks/connect` (Stripe-signature-verified via a **separate** Connect webhook
  secret) reduces `account.updated` to `{type, accountId, payoutsEnabled}` and records the
  worker's `stripePayoutsEnabled` (new nullable `UserRecord` field + both repos + migration
  `0036`; cleared on anonymize, carried through a profile edit; `findByStripeAccountId`
  added). Seam `ConstructConnectEvent` + `stripeConnectEventConstructor` +
  `selectConnectEventConstructor` (config-gated on `STRIPE_SECRET_KEY` +
  `STRIPE_CONNECT_WEBHOOK_SECRET`; endpoint 404 when unset) in `connectWebhookService`;
  `connectService.recordConnectPayoutStatus` persists it. `payoutService.tryTransferPayout`
  now **also gates on `payouts_enabled`** — a transfer only fires once Stripe confirms the
  account can receive payouts (avoids a guaranteed-to-fail transfer). Tests
  `tests/connect-webhook.test.mjs` (constructor verify/reduce + bad-sig 401; select gating;
  handler records/ignores; endpoint 404); `connect-payout.test.mjs` updated to enable payouts
  via the webhook before expecting a transfer. Backend only — merged.
- **167** payout **backfill** (**payout hardening**, closes the Connect gap). New
  `payoutService.retryPendingPayoutsForWorker(workerId)` re-runs the guarded, best-effort
  `tryTransferPayout` over each of a worker's still-pending payouts;
  `connectService.recordConnectPayoutStatus` calls it whenever `account.updated` flips
  `payouts_enabled` to true — so a payout scheduled before onboarding finished (left pending
  by slice 166's gate) now goes out automatically, no manual step. Covered end-to-end in
  `tests/connect-payout.test.mjs` (new: pay while not-yet-enabled → payout pending, no
  transfer; then `account.updated` enabled → retried → transferred + settled); its
  `onboardWorker` helper was split into onboard + `setPayoutsEnabled(bool)`. Backend only —
  _handed off_. **The real Connect payout line is now complete: onboard → gate on
  `payouts_enabled` → transfer on settle → backfill the gap.**
- **168** SEC-0007 — direct admin refund now reverses the worker's payout. A money-flow
  security review found that `POST /service-requests/:id/payment/refund` → `refundPayment`
  refunded the customer (and reversed the provider charge) but left the worker's scheduled
  payout intact, so a still-pending payout would still transfer (customer refunded **and**
  worker paid — silent double loss); the cancel-and-refund path already reversed it, the
  standalone refund didn't. Fix: `refundPayment` now calls `reversePendingPayout(payment.id)`
  before any money moves — removes a pending payout, or 409s if already paid out (manual
  clawback) — so every caller is safe; `adminCancelService` simplified to just call
  `refundPayment`. Ledger `SEC-0007` + `tests/refund-reverses-payout.test.mjs`. Backend only
  (touches the code-owner-protected `docs/security-fixes.md` → needs security-reviewer
  approval) — merged.
- **169** SEC-0008 — provider **refund webhook** reconciles the worker payout. Sibling of
  SEC-0007 on the other refund path: a `payment.refunded` webhook (a refund issued from the
  Stripe/PayPal dashboard, or a chargeback) settles via `confirmPaymentRefunded`, which our
  admin `refundPayment` never runs, and it left the payout intact → same double-pay. Fix:
  new `payoutService.reconcilePayoutForExternalRefund(paymentId)` — the non-throwing sibling
  of `reversePendingPayout` (removes a pending payout; no-op for an already-sent one, since a
  verified webhook must be acknowledged, not 409'd) — called by `confirmPaymentRefunded`
  before `markRefunded`. Ledger `SEC-0008` + `tests/refund-webhook-reverses-payout.test.mjs`.
  Backend only (code-owner-protected `docs/security-fixes.md` → needs security-reviewer
  approval) — merged. **Both refund paths (admin action + provider webhook) now
  reconcile the payout.**
- **170** status-doc refresh (docs only). Sections 1–5 had gone stale: they still listed
  **"a real payment-provider adapter"** and **"an interactive map picker"** as open gaps
  though both shipped (payments 129–169; map picker 124), still described payments as
  "mock/sandbox — no real money moves", and the snapshot/update log stopped at 2026-07-01.
  Rewrote the header snapshot + update log, the one-sentence summary, the payments section
  of **What is done** (Stripe + PayPal + real refunds + Connect payouts + SEC-0007/0008),
  the migration list (now 0001–0036), matching (map picker), media/realtime (chat is
  WebSocket true-push, not polling), and re-derived **What a testable v1 still needs** (now:
  public frontend deploy → E2E/device QA → observability/backups → payments go-live as an
  operator step) and **Recommended next slices**. Also fixed the section-6 heading range.
  No code — merged.
- **171** [BUG] Connect accounts never requested the **`transfers` capability**. Found while
  verifying the Connect API against current Stripe docs before writing the go-live runbook.
  `stripeConnectOnboarder` created the worker's Express account with
  `accounts.create({ type: 'express' })` and **no capabilities** — but a Stripe capability is
  inactive until it is _requested_ and verified, so `transfers` would never activate,
  `payouts_enabled` would never turn true, and (behind the slice-166 gate) **every payout
  would sit `pending` for ever, silently**. The whole real-payout line was inert in
  production. Fix: the account is created from an exported `EXPRESS_ACCOUNT_PARAMS`
  (`{ type: 'express', capabilities: { transfers: { requested: true } } }`) — only
  `transfers` is requested, since the worker merely _receives_ funds and never charges cards,
  and requesting `card_payments` would demand more onboarding data. Regression test in
  `tests/connect-onboarding.test.mjs` locks the params (the real `accounts.create` needs the
  network, so it is exercised only in the go-live dry run, never in CI). Backend only —
  merged. (The currency blocker it flagged is fixed in **172**.)
- **172** platform currency **TWD → USD** (US market). The second go-live blocker: a Stripe
  transfer to a worker's connected account must be in the platform's **settlement currency**,
  so a US platform paying out in `twd` would simply fail. Introduced one source of truth —
  `PLATFORM_CURRENCY` + `currencySchema` in `shared/schemas.ts` — and pointed the four money
  schemas (payment, quote, payout, receipt) and the three services (`paymentService`,
  `quoteService`, `payoutService`) at it. Migration **`0037`** re-denominates existing rows:
  this is **mandatory, not cosmetic**, because the Postgres repositories parse rows through
  those schemas (`paymentSchema.parse`), so a leftover `'TWD'` row would **throw on read**.
  Safe as a plain relabel — no real money has ever moved (mock mode), and the integer
  minor-unit amounts carry over unchanged. App money display moves from `NT$…` to `$…`
  (`formatCents`) and the quote/payment inputs now say "Amount in USD". The US$1 floor
  (`MIN_AMOUNT_CENTS = 100`) is unchanged and clears Stripe's own US$0.50 minimum.
  `tests/currency.test.mjs` locks it (schemas reject any non-USD currency). server + shared +
  app + app-expo — merged.
- **173** `docs/connect-go-live.md` — the Stripe **Connect payouts** runbook, the last missing
  payments doc (Stripe and PayPal already had one). Covers what the config switches on
  (onboard → `account.updated` → `payouts_enabled` → transfer → backfill), the required
  environment (incl. the **separate** `STRIPE_CONNECT_WEBHOOK_SECRET` and the build-time
  `EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED`), the webhook endpoint scoped to **Connected
  accounts**, a test-mode dry run (including a **backfill check**), go-live, rollback, and the
  gotchas — the `transfers` capability (171), that `return_url` does **not** mean onboarding is
  complete, single-use account links, USD settlement, and the refund↔payout interaction
  (SEC-0007/0008). Docs only — _handed off_. **All three payments runbooks now exist; going
  live is purely an operator step.**
- **174** visit **scheduling** — propose / confirm (backend). `scheduledAt` was only a one-way
  wish: the customer typed a time, nobody agreed to it, nothing enforced it. It is now a
  **two-party agreement**. New `scheduleStatus` (`unset` / `proposed` / `confirmed`) +
  `scheduleProposedBy` on the request; `POST /service-requests/:id/schedule` (propose) and
  `POST …/schedule/confirm`. The protocol is a counter-offer: **either party may propose, and
  only the OTHER party may confirm** (409 on confirming your own), so neither side can book the
  other unilaterally; re-proposing after a confirmation drops back to `proposed` — that is a
  reschedule. A time given at creation is now recorded as the customer's proposal. Guards:
  party-only (**admins are excluded** — they can see the request but are not a party to the
  appointment, 403), an assigned worker is required (422), the request must not be closed
  (422), and the time must be in the future (422). Notifies the other party and audits
  `schedule.proposed` / `schedule.confirmed` (+ `AuditLogScreen` labels). Migration `0038`
  (columns + CHECKs + backfill of existing times as customer proposals). **Consistency:
  releasing/resetting a job now also drops the schedule** — the appointment was an agreement
  with _that_ worker, so the next one must not inherit a confirmed time they never agreed to
  (same reasoning as SEC-0005's stale-quote clearing). `tests/schedule.test.mjs`. Backend +
  shared + `AuditLogScreen` — merged.
- **175** visit scheduling — **app UI**. `apiClient.proposeSchedule(id, iso)` /
  `confirmSchedule(id)`. The negotiation is rendered from a **pure** `deriveScheduleView`
  (`app/src/features/schedule/scheduleView.ts`, the same approach as `deriveQuoteView`), so the
  screen stays dumb: it returns the summary line written for whoever is looking ("You proposed
  … waiting for the worker" vs "The customer proposed … confirm it, or suggest another"), plus
  `canConfirm` / `canPropose` / `proposeLabel`. It **mirrors the server's guards** (party-only,
  worker assigned, job open) so the UI never offers an action that would 422, and an admin sees
  the time **read-only** — they are not a party to the appointment. RequestDetailScreen gains a
  **Visit time** section: a Confirm button only when the OTHER side has a proposal outstanding,
  and a time field + Propose / **Propose a new time** (reschedule). `parseLocalDateTime`
  (`scheduleFormat.ts`) converts the typed `YYYY-MM-DD HH:MM` to an ISO instant **by
  constructing the Date from parts** — parsing a bare `"2026-08-01 14:30"` is unspecified and
  Hermes ≠ V8 — and rejects malformed/impossible dates locally, so an obvious mistake never
  round-trips. Tests: `tests/schedule-view.test.mjs` (pure) and a new
  `RequestDetailScreen.schedule.test.tsx` (kept separate — the main screen test is already
  ~1000 lines). app + app-expo — merged. **Visit scheduling is now usable end-to-end.**
- **176** status-doc correction — **the "public frontend deploy" gap was a ghost.** The
  web app has been built into the image (`webbuild` stage → `app-expo/dist`) and served
  **same-origin** by the API via `WEB_DIST_DIR` since 123/124, and `docs/deployment.md`
  documents it; `/ready` on the Railway deployment is green. The gap entry was stale and
  **survived the slice-170 refresh by mistake** (the same failure mode 170 was supposed
  to fix — I re-listed it without verifying). Corrected §1, §2 (deploy), §3, §4 and §5.
  The remaining gaps are now honestly stated as **QA and operations, not engineering**,
  and §3/§5 now call out the one thing CI can never prove: **that the deployed web app
  actually renders in a browser** (a zod 3-vs-4 mismatch once blanked it for several
  slices). Docs only — _handed off_.
- **177** payments runbooks: **the Stripe dashboard steps were stale**. Found the moment the
  runbook was used for real: `stripe-go-live.md` said _"stay in **Test mode** (toggle, top
  right)"_ and _"**Developers → Webhooks → Add endpoint**"_. Stripe has since replaced the
  Test-mode toggle with **Sandboxes** and moved webhooks into **Workbench → Webhooks →
  Create new destination** — the old path no longer exists, so the runbook sent the operator
  looking for a menu that isn't there. Rewrote §1/§2 and the go-live step against the current
  UI (verified against Stripe's docs), and applied the same correction to
  `connect-go-live.md`. Also added the **pre-flight check** to `stripe-go-live.md` — a
  `curl -X POST /webhooks/stripe` that must return **400** (armed) and not **404** (config
  never reached the server), so a misconfiguration is caught _before_ a payment is attempted
  rather than debugged mid-flow. Docs only — merged.
- **STRIPE TEST-MODE DRY RUN — PASSED.** The first time any of this touched a real provider.
  The whole line ran end to end against a Stripe sandbox: charge → hosted Checkout → signed
  `checkout.session.completed` → settle → Connect onboarding → `account.updated` →
  `payouts_enabled` → transfer → **backfill**. Three payouts ($425 / $153 / $2,550) that had
  been sitting `pending` were released together, one second apart, the moment the account
  became payouts-enabled — **slice 167's backfill, proven live.** It found three defects CI
  can never catch, because CI never talks to a provider: the missing `transfers` capability
  (**171**), the hard-coded TWD currency (**172**), and the unmapped onboarding error
  (**178**). Two operational traps are now in `connect-go-live.md`: the Connect webhook
  endpoint **must** be created with `connect=true` (an endpoint scoped to "Your account" is
  never sent a _connected_ account's `account.updated` — it looks perfectly healthy and
  simply never fires), and the platform's **available** balance must cover the pending
  payouts or every transfer fails and the payouts stay `pending` **silently**, by design.
- **178** [BUG] Connect onboarding failed with a bare **500 "Internal Server Error"**. Found by
  the dry run, and it cost hours: Stripe rejected `accounts.create` because Connect was not yet
  enabled on the platform, and the worker was told only that _we_ had crashed. Cause:
  `startConnectOnboarding` let the **Stripe SDK's own error** reach the error boundary, which
  treats an unrecognized error as a crash (500, generic body). Every other provider adapter
  already maps its failures — the PayPal ones all raise 502 — this path was the one that did
  not. `connectService.createOnboarding` now wraps the provider call: **502** (the upstream
  refused, so it is not the worker's fault and is worth retrying) with a message about payout
  setup, and an `AppError` from the provider passes through with its own status. The provider's
  wording is **not** echoed back — a Stripe failure here is platform misconfiguration or a
  transient outage, neither of which the worker can act on, and the message can name our
  configuration. Crucially the reason is **logged in `createOnboarding`**, not left to the
  boundary, which deliberately does not log `AppError`s: mapping the error without that would
  have traded a misleading status for a lost diagnostic. The log carries the Stripe
  `type` / `code` / **`requestId`**, which points straight at the call in Stripe's request log.
  `tests/connect-onboarding.test.mjs`. Backend — _handed off_.

- **179** **SEC-0009 — password-reset tokens were being written to the application log.**
  Found while auditing the logs _before_ wiring up log shipping, which turned out to be the
  right order. `loggingSender` — the inert fallback used whenever `EMAIL_API_URL` is unset,
  **which is the live deployment** — logged every notification in full:
  `[notify:email] to=victim@example.com :: Use this code to reset your password: 9f3a…`.
  The reset token is stored **only as a SHA-256 hash** precisely because the plaintext is the
  secret; it was being printed next to the address it unlocks. Anyone who could read the logs
  could take over any account (request a reset for the victim → read the token → reset the
  password; `resetPassword` also bumps `token_version`, logging the real owner out
  everywhere). **Critical**, and it was about to be shipped to a third-party log drain.
  Fixed by redacting **by construction, not by discipline**: `notificationLogFields()` is now
  the only way to log an outbound message and structurally cannot emit `to` or `body`;
  `OutboundMessage` carries a `userId` so a delivery is still identifiable without revealing
  how to reach the person. The genuine dev need (the token is unrecoverable from the DB, so
  forgot-password could not be tested on a laptop at all) is met by an explicit
  `NOTIFY_LOG_BODY` switch that `env.ts` **refuses at boot in production** — the same
  `superRefine` production-invariant pattern as SEC-0004. `docs/deployment.md` had already
  promised logs contain no such thing; the guarantee was documented and untrue, and is now
  enforced. `tests/notification-log-redaction.test.mjs` locks it end-to-end through
  `POST /auth/forgot-password` with **no sender override** — the real vulnerable path.
  Backend + docs — _handed off_.

- **180** `docs/backups.md` — **the managed-backup section was vague and out of date.** It
  said Railway "takes automated backups on the plan's schedule" and left the operator to
  work the rest out. Railway actually offers **two independent mechanisms** with different
  guarantees, and the difference is the whole point: scheduled **volume snapshots** (Daily
  is kept only **6 days**; restoring one **deletes every newer backup**; wiping a volume
  deletes all of them; they only restore into the same project+environment) and
  **Point-in-Time Recovery** (continuous WAL archiving via pgBackRest; restore to any
  timestamp; the restore provisions a **new sibling service** and never touches the
  source). Rewrote the section against the current Railway docs, with the footguns stated.
  **PITR is the one that matters here**: HomeFix runs its SQL migrations **automatically on
  boot**, so a faulty migration mutates production the moment a deploy lands — snapshots
  only rewind to last night, PITR rewinds to the minute before it ran. And **the PITR
  window is not retroactive**, so it has to be switched on before it is needed. Also
  rewrote "Verifying a backup" into an actual **restore drill** (the step that is always
  skipped and the only one that proves anything) — safe to run against production precisely
  because a PITR restore leaves the source serving traffic — and made it record the
  **measured** RTO instead of an aspirational one. Docs only — merged.

- **181** `docs/go-live-checklist.md` — **none of slice 180 is actually enabled, and the
  deferrals had nowhere to live.** The current Railway plan offers neither snapshots nor
  PITR, so **the production database has no recovery story today.** That is a fine trade for
  an internal alpha holding test data and a bad one the moment a real customer's job,
  payment, or payout is in it — but "we'll do it at launch" written in a chat log is not a
  plan. So: one file listing everything that must become true before a real user touches the
  app, blockers first, each with the reason it is deferred. `docs/backups.md` now opens with
  the warning, and §3 above points here.

  Writing it surfaced a gap **more urgent than backups**: `EMAIL_API_URL` is unset, so the
  email channel falls back to the inert sender and **`POST /auth/forgot-password` sends
  nothing** — and since SEC-0009 it (correctly) no longer logs the token either. A real user
  who forgets their password has **no way back into their account at all**. No test catches
  it, because every test injects a sender; it is pure configuration, and it is now the top
  blocker. Docs only — _handed off_.

- **182** make the **password-reset mail actually send** — the top blocker from 181, and it
  needed **no adapter**: `createHttpEmailSender` already POSTs
  `{from,to,subject,text}` with a bearer key, which is **exactly Resend's send API**. So this
  slice is the three things that would have made "just set the env vars" fail confusingly.

  **(1) The failure was silent.** `requestPasswordReset` swallowed a send failure in a bare
  `catch {}`. A 403 for an unverified sending domain — the normal day-one failure — produced
  a cheerful 204 and left **no trace anywhere**: the user waits for a mail that never
  arrives, cannot get into their account, and nobody finds out. The endpoint must still
  return 204 (saying otherwise would disclose whether the account exists), so the log is the
  only possible signal — and there wasn't one. Now logged, with the provider's own reason.
  Same class as 178: swallowing the error is fine, swallowing the _evidence_ is not.

  **(2) The reason had to be safe to log.** This is the residual SEC-0009 explicitly
  recorded and deliberately left open: a mail API echoes your request back when it dislikes
  it, and our request body **is** the plaintext reset token. Enabling a real provider makes
  that live, so `redactProviderError` now strips our exact recipient and body, then sweeps
  for anything address- or secret-shaped the provider volunteered. It is applied in
  `passwordResetService` too, not only in the sender — the sender is injectable, and the
  function that _owns_ the secret is the one that must guarantee it.

  **(3) `EMAIL_FROM` rejected the value the docs hand you.** It was `z.email()`, so
  `HomeFix <noreply@…>` — the display-name form in every provider's copy-paste example —
  **failed the boot**. Both forms are accepted now.

  New `docs/email-go-live.md` (the fourth provider runbook), and `.env.example` corrected:
  it claimed email needed `NOTIFY_CHANNELS`, which is **false for password reset** —
  `passwordResetService` resolves its sender straight from `EMAIL_*`. Tests:
  `tests/email-sender.test.mjs` (redaction + the error body reaching the caller + the
  display-name sender) and `tests/notification-log-redaction.test.mjs` (a failing provider is
  logged loudly and leaks nothing). Also **fixed a test that could pass vacuously**: the
  SEC-0009 end-to-end case registered its user through the test's module graph, which under
  tsx is not the app's — behind HTTP the account did not exist, and `forgot-password` returns
  204 for an unknown address, so it would have minted no token and leaked nothing while
  proving nothing. It now uses a demo-seeded account and asserts a login first. Backend +
  docs — _handed off_.

- **EMAIL IS LIVE (2026-07-13).** Resend wired up, and the password-reset mail **arrives**. The
  top blocker from 181 is down to one remaining step: verify a sending domain (until then
  Resend will only deliver to the account owner's own address). The diagnostic added in 182
  paid for itself immediately — the first failed attempt logged
  `notification not sent (no provider configured)`, which said in one line that the `EMAIL_*`
  variables had never reached the server. Before 182 that was a silent 204.
- **183** password-reset **magic link** — the emailed code is 64 hex characters, and a person
  was being asked to copy it out of a mail client and into a form by hand. That is not a
  cosmetic problem; it is how people abandon a reset and lose the account.

  **The tempting fix — a friendly 6-digit code — would have been a security regression**, and
  the reasoning is now written into `docs/email-go-live.md` so nobody re-proposes it:
  `resetPassword` looks a token up **by the token alone** (`findByTokenHash`), with no email to
  scope the lookup. So an attacker need not target anyone — they guess, and a hit resets
  _whichever_ account had a reset pending. A million possibilities, and **the odds improve as
  the userbase grows**. Short codes are only safe when bound to one account and killed after a
  few wrong guesses; this flow does neither.

  So the entropy stays and the typing goes: the mail leads with a link
  (`APP_PUBLIC_BASE_URL` + `/?reset=<token>`), the app reads the code out of the URL, and the
  user goes straight to the new-password step. The code is **still printed underneath** — mail
  clients strip links, and people read mail on a device that isn't the one running the app.

  Two consequences of putting a secret in a URL, both handled rather than hand-waved:
  **(1)** the app strips the token from the address bar the instant it reads it
  (`replaceState`, so Back cannot restore it) — otherwise it lives on in history, session
  restore, and whatever gets pasted when someone shares "the page I'm on"; **(2)** new
  `securityHeaders` middleware sends **`Referrer-Policy: no-referrer`** (plus `nosniff` and
  `X-Frame-Options: DENY`) — without it the **Google Maps SDK on that very page** would have
  received the full URL, token and all, as a `Referer`. The secret we work hard to keep out of
  our own logs would have gone straight into someone else's.

  Notable: **nothing in the app had ever read a query string.** `?payment=success` and
  `?payouts=done` have been configured at the providers for many slices and were silently
  dropped on arrival. `app/src/features/auth/resetLink.ts` (pure: `readResetCode` /
  `urlWithoutResetCode`) is the first, and the mechanism the others could now reuse. Tests:
  `tests/password-reset-link.test.mjs` (mail body, round-trip, URL stripping, and that the
  token is still redacted from provider errors now that it lives inside a URL — SEC-0009),
  `tests/security-headers.test.mjs`, and `ForgotPasswordScreen.test.tsx` (arriving by link
  shows neither the email step nor a code field). server + app + app-expo — _handed off_.

- **184** Payouts screen: **reflect the worker's actual payout status**. The screen keyed off
  nothing but the build-time feature flag, so it offered **"Set up payouts"** to every worker
  for ever — including one who had already finished. `GET /me` now carries a read-only
  `payoutAccountStatus` (workers only), derived in `profileService.payoutAccountStatus`.

  **Three states, not two**, and the middle one is the point. `pending` — a connected account
  exists but Stripe has **not** confirmed it can receive money — is a real, common state:
  returning from the hosted onboarding proves nothing (`docs/connect-go-live.md` has said so
  since 173), only the `account.updated` webhook does. That worker was the badly served one:
  their payouts sit `Pending` **by design** (`tryTransferPayout` will not send to an account
  Stripe has not cleared) and the screen offered no hint as to why — which is exactly what the
  Stripe dry run felt like from the worker's side. It now says so, and says it resolves itself:
  slice 167's backfill releases everything the moment the webhook lands. Collapsing `pending`
  into either neighbour reintroduces one of the two bugs, so the enum is deliberate.

  The three states share one endpoint: `startConnectOnboarding` reuses an existing connected
  account and just mints a fresh hosted link, so "Set up payouts" / "Finish payout setup" /
  "Update payout details" are the same call. When the status **cannot be read**, the section
  is hidden rather than defaulting to "Set up payouts" — guessing there is the original bug.
  Pure `derivePayoutSetupView` (`app/src/features/payouts/payoutSetupView.ts`, the
  `deriveScheduleView` pattern) keeps the copy and the state machine testable without a
  renderer. `tests/payout-setup-view.test.mjs`, `tests/profile-payout-status.test.mjs` (driven
  over HTTP — the tsx module-identity trap makes a direct repository import useless here), and
  `PayoutsScreen.test.tsx`. server + shared + app + app-expo — _handed off_.

- **185** **browser E2E** — the one thing CI has never checked: that the exported web bundle
  actually **runs**. `npm test` proves the API works and jest proves the components work, but
  the web build was only ever verified to have _produced_ files. That gap has already cost us
  once: a **zod 3-vs-4** mismatch made the bundle throw on boot and render a blank white page,
  and it shipped that way **for several slices with CI fully green**, because nothing ever
  loaded it. The same class of failure — a bad bundle, a broken import, an unhandled rejection
  on the login path — remains invisible to every test we have.

  New `Web E2E` CI job: build the real export (the same `export:web` the Docker image runs),
  serve it from the real server on an in-memory store with the demo users seeded, and drive it
  with Chromium. Three specs, deliberately few — the API tests are faster at everything else:
  **(1)** the bundle boots without throwing and the login form renders (this alone would have
  caught the zod bug); **(2)** a customer signs in, posts a request, and it comes back from the
  API — proving the token round-trip and the authenticated client work _from a browser_;
  **(3)** a rejected login surfaces as a message rather than an unhandled rejection (the
  `isApiError` structural guard exists because cross-module `instanceof` has failed on exactly
  this path before).

  Every spec fails on **any uncaught `pageerror`**, and the boot spec also fails on console
  errors outside a short, justified allow-list. Selectors are the app's own
  `accessibilityLabel`s (react-native-web renders them as `aria-label`), so the tests break if
  the accessibility contract breaks — the right coupling. `docs/qa-checklist.md` updated: the
  web smoke and login/create paths no longer need re-testing by hand; **native, device,
  accessibility and performance still do.** _handed off_.

- **186** **the app could not be built for a phone at all** — `app-expo/app.json` was still the
  unmodified `create-expo-app` template. No bundle identifier, no package name, no URL scheme,
  no EAS project, and `plugins` listed exactly one entry. Auditing it before building (rather
  than after a 20-minute build failed) found three defects that every test we have was blind to,
  because the four native adapters have **no tests** and `App.tsx` — the only place the real
  ones are wired in — is never rendered under test. Green meant nothing here.

  **(1) Push could never have worked, on any device, ever.** `getExpoPushTokenAsync()` was
  called with no `projectId`, and the config had no `extra` block, so the library found none
  from any of its three sources and threw every single time. `registerForPush` swallowed the
  error; `App.tsx` discarded the outcome. A feature that had never once succeeded looked exactly
  like a feature that worked. Same class as 178 and SEC-0009: swallowing the failure is fine,
  swallowing the **evidence** is not. Now the id is passed explicitly, its absence says what to
  run (`eas init`), and the outcome is logged.

  **(2) iOS would have hard-crashed** on the first location or photo call — iOS terminates the
  process when a protected API is touched with no usage-description string, and `ios` was
  `{ "supportsTablet": true }` and nothing else. The permission _code_ was correct all along.
  The `expo-location` / `expo-image-picker` plugins now inject the strings.

  **(3) Android's map picker was a blank grey square.** `mapPickerAvailable` was hard-coded
  `true` on native, but Google Maps renders empty tiles with no API key — **no error, no
  warning** — so a user would drag a pin across nothing and submit a location they never saw.
  Worse than no map at all. Now gated per platform: iOS always (Apple Maps needs no key),
  Android only when a key is configured. New `app.config.ts` reads the key from the environment
  (it must never be committed) and publishes `extra.androidMapsConfigured` so the app knows at
  runtime whether a map will actually appear.

  Also: `eas.json` (development / preview / production), and `docs/device-build.md` — the
  runbook, including what is **still** open and can only be settled on a device (foreground
  notifications do not render — there is no `setNotificationHandler`; hosted checkout returns to
  the _web_ app, so a native payer lands there and the app only learns via the webhook on next
  refresh). app-expo + app + docs — _handed off_.

- **187** commit the EAS project wiring — the config that `eas init` and the first `eas build`
  generated (`extra.eas.projectId`, `owner`, `updates.url`, `runtimeVersion`, plus
  `expo-updates` / `expo-dev-client` / `expo-constants`), so the build is reproducible rather
  than living only on one laptop. The `projectId` is the specific value whose absence made push
  impossible in 186, so committing it is what makes that fix real. Also dropped `newArchEnabled`
  from `app.json` (the config schema rejects it; new arch is the SDK 56 default) and aligned six
  packages to the SDK's expected versions. **The Android development build then succeeded.**
  app-expo — merged.
- **188** **first device-QA finding, fixed.** With 186/187 the app finally ran on a device (an
  Android emulator), and the very first screen surfaced a real bug that web and jest could never
  have shown: the **admin "All requests" header overflowed a phone's width.** It packs six nav
  links (Profile / Dashboard / Users / Certifications / Audit log / Log out) into a
  non-wrapping, non-scrolling `row`, so on a narrow screen the last two were clipped off the
  right edge and **unreachable**. The customer and worker headers already had `flexWrap` +
  `maxWidth` + `alignSelf` and wrapped gracefully; the admin one was simply the outlier that
  never got the treatment. Brought it in line with the sibling pattern. (The filter chip rows
  that also look clipped are **not** a bug — they are intentional horizontal `ScrollView`s.)
  This is exactly the class of thing the device pass exists to catch. app-expo — _handed off_.

- **189** device-QA outcomes recorded (docs). The app **ran on a real device for the first
  time** (Android emulator). What the pass proved, and what it surfaced:

  - **Works on device:** login against the live API, create-request end-to-end (→ Railway →
    detail screen), location capture from the emulator's set coordinates, and "Open in Maps"
    (the external `Linking` deep link).
  - **Found + fixed:** the admin header overflow (slice 188).
  - **Push: the diagnostic worked exactly as slice 186 intended.** The old silent failure is
    gone; the device log now names the cause — `Default FirebaseApp is not initialized ...
com.homefix.dev`. That **confirms the app code is right** (186's `projectId` fix cleared
    the first error; we reached the next). The remaining work is external: **FCM credentials**
    for Android push (Firebase project + `google-services.json` + FCM key to Expo), APNs for
    iOS. Recorded on `docs/go-live-checklist.md`; not a blocker.
  - **Deferred, not failed:** the **in-app map picker** (react-native-maps) can't be validated
    on the dev-server path — `GOOGLE_MAPS_ANDROID_KEY` is an EAS secret, invisible to
    `npx expo start`, so `androidMapsConfigured` is false and the button is hidden. It needs a
    `preview` build (or the key exported locally). The **external** maps link is confirmed.
    Photo upload skipped (an emulator-setup nuisance, and the field is optional).

  `docs/device-build.md` gains a verified "Android emulator on Windows" section (the path
  actually used) and the FCM finding. Docs only — _handed off_.

- **190** filter chips **wrap instead of scrolling off-screen** — the follow-on to 188, across
  all three roles. The status and category filters were horizontal `ScrollView`s: on a phone the
  later options sat past the right edge with no scroll affordance, so they read as "cut off"
  (device-QA finding). `StatusFilter` and `CategoryFilter` are now wrapping rows
  (`flexWrap: 'wrap'`), so every option is visible at once — two or three rows on a narrow
  screen. Shared components, so customer / worker / admin all get it from one change; the
  existing tests query by `accessibilityLabel` and are unaffected. app-expo — _handed off_.

- **191** **visit time is now a date/time picker, not hand-typed text.** Both the create-request
  "Preferred time" and the two-party schedule proposal used a bare `YYYY-MM-DD HH:MM` text box —
  and in the schedule flow both parties had to type it. Replaced with a tap-to-pick field: the
  **OS calendar** on a phone (`@react-native-community/datetimepicker` — date then time on
  Android, an inline modal on iOS), and the browser's native **`datetime-local`** input on web.
  New shared, injected picker following the app's established seams: pure helpers
  (`app/src/features/schedule/dateTimePicker.ts` — `toDateTimeLocalValue` /
  `fromDateTimeLocalValue` / `formatVisitTime`, unit-tested), a presentational `DateTimeField`
  (+ `.web.tsx`) that imports **no** native module, and the real opener behind an injected
  `OpenDateTimePicker` (`dateTimePicker.tsx` native / `.web.tsx`), so screens and their jest
  tests never touch the native module — they inject a fake, exactly like `mapPicker`. The
  picker only yields valid future times, so the string-parsing and "unparseable time" error
  paths are gone; `scheduledAt` is sent as `date.toISOString()`. **New native module ⇒ a new
  `eas build` is required before it runs on device** (the current dev build does not include
  it). Tests updated: `tests/date-time-picker.test.mjs`, and both screen tests now drive the
  picker via an injected fake. app-expo + app — _handed off_.

- **192** [BUG] **a customer could never actually pay after any delay.** Found on a real device:
  the customer set up the payment, logged out so the worker could do the job, logged back in to
  pay — and "Pay now" did nothing. Cause: the hosted `checkoutUrl` rode only on the create
  response and was never persisted, so after any reload it was gone (re-`createPayment` is a 409,
  a GET never carried it, `/pay` is 409-locked for a real provider). A dead end for **every**
  real user — everyone leaves and comes back before paying.

  Persisting the URL was rejected because a Stripe **Checkout Session expires (~24h)**, so a
  stored URL goes stale exactly when a home-repair job runs over a day. The fix instead mints a
  **fresh session on demand**: new `POST …/payment/checkout` (`startCheckout`) opens a new
  session — a **fresh idempotency key** so an expired one is never reused — and returns its URL;
  the app's "Pay now" calls it every time. It is never stale, regardless of how long the job
  takes.

  The **refund-integrity half** (the reason regeneration was scary): a fresh session means a
  fresh PaymentIntent, so the payment's `providerRef` — which refunds target (SEC-0007/0008) —
  must follow the intent that **actually** settled. The `checkout.session.completed` webhook now
  carries `payment_intent`, and `confirmPaymentPaid` **reconciles `providerRef` to it** when the
  payment is marked paid. So no matter how many sessions were opened, a later refund hits the one
  that was charged. Locked by `tests/stripe-checkout-e2e.test.mjs` (fresh session on demand;
  providerRef reconciled to the paid intent).

  **This needs an app rebuild** — `payNow` now calls `startCheckout` (server + shared + app).
  Not a security fix (no `SEC-NNNN`): it hardens the refund path rather than fixing a shipped
  leak. _handed off._

- **193** in-app **saved-card payments, Phase 1: SDK wiring.** The start of the Uber-style
  saved-card feature (save a card once, then pay in-app in a tap) — chosen to **coexist** with
  the proven hosted-checkout flow, not replace it. This phase does only the groundwork so it is
  verifiable in isolation: `@stripe/stripe-react-native` is installed and a `StripeAppProvider`
  wraps the app root (`app-expo/src/stripeProvider.tsx`), **web-split** (`.web.tsx` renders
  children unchanged) so the web bundle never imports the native SDK — the same pattern as
  `mapPicker`. Gated on `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (a **publishable** key, safe to
  ship): unset, the provider renders children directly, so the app boots with no SDK and hosted
  checkout still works; set, the SDK is available beneath it. **New native module ⇒ a new
  `eas build`.** No server changes yet — the Stripe **Customer** data model, SetupIntent/
  PaymentSheet save flow (Phase 2) and off-session charge + SCA fallback (Phase 3) come next.
  app-expo + docs — _handed off_.

_All slices above are merged to `main` except **134** (auth audit), **152**
(Stripe go-live runbook), and **193** (saved-card Phase 1), which were handed off._
The API **and the web app** are deployed and ACTIVE on Railway (same-origin). Stripe
(payments **and** Connect payouts) has been exercised **live in a sandbox** — see the dry-run
entry above; the default remains mock mode (no key set).\_

_Prior snapshot (100–110b): SEC-0005 billing consistency; DB hardening (indexes /
CHECK / foreign keys, migrations 0016–0021); account lifecycle end-to-end (104–108);
payment split + webhook seam + refunds (109–110b)._
