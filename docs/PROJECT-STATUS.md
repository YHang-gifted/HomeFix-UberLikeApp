# HomeFix — Project Status & Road to a Testable v1

_Snapshot as of 2026-07-01. Compiled against the original vision: an Uber-like
home-repair marketplace with three roles (customer, worker, admin), a request
lifecycle, worker matching, quoting, payments, reviews, and messaging._

> **Update log.** Since the 2026-06-30 snapshot the following completed and merged:
> the **real-money mock flow end-to-end** — the **payout** leg (worker net → a
> pending payout on every paid payment, settled via a `payout.paid` webhook, with a
> worker payout-history screen) now joins the split, webhook confirmation, and
> refunds; **image upload** (provider-agnostic mock store + app picker/upload +
> real `expo-image-picker` provider); **live-updating chat** (the message thread
> polls while open); and **per-user notification preferences** end-to-end (email /
> push toggles in Profile; a channel only delivers when globally enabled **and** the
> recipient wants it). Migrations are now 0001–0028. The real-money **mock** flow is
> complete; the remaining real-money work is a **real provider adapter** (intent
> creation + stored provider reference + raw-body signature verification), deferred
> until a provider is wired.
>
> **Update log (later on 2026-07-01).** Also merged since: an **interactive map
> picker** for request coordinates (a pure region helper + injected `react-native-maps`
> modal, hidden on web); the **real payment-provider integration shape** —
> payments now carry the provider's own **`providerRef`** (mock by default) and the
> payment/payout **webhooks are resolved by that reference and authenticated by an
> HMAC-SHA256 signature over the raw request body** (`x-webhook-signature`), exactly
> as a real provider signs; and **expanded audit** covering the quote lifecycle
> (proposed / accepted / declined) and payment creation. Migrations are now
> 0001–0029. A structured **5xx error-logging** slice is in review. The remaining
> real-money work is now only a concrete provider adapter (creating the charge with
> a client secret) plus its credentials — the surrounding flow is provider-shaped.

## 1. Where we are in one sentence

The **marketplace engine is built, tested end-to-end, hardened for operation, and
the API is now live on a hosted environment** — a customer can sign up, post a
repair request, get matched (admin assignment or a worker self-claiming by
category), receive and accept a worker's price quote, pay the agreed amount,
message the other party, and review the worker (and read the worker's reply) —
all persisted to Postgres, behind server-side authorization, and covered by an
extensive test suite. Accounts now have a **full lifecycle** (change/forgot
password, log-out-everywhere, admin suspend/reinstate, self-delete) and payments
carry a **marketplace commission split** with a **provider-webhook confirmation
seam, refunds, and worker payouts** (still mock/sandbox — no real money moves).
Requests support **photo upload**, chat threads **update live** while open, and
each user controls their **email/push notification preferences**. We are at
**internal alpha, deployed**, with the main gaps to a real-user test build being
**a public frontend deploy, a map/place picker, a real payment-provider adapter,
and a full E2E/device QA pass** — not core domain logic, notification delivery, or
a deploy target.

## 2. What is done

**Foundation & quality.** TypeScript-strict monorepo (`shared` / `server` /
`app` logic / `app-expo` UI), ESLint + Prettier + typecheck + tests as enforced
quality gates, CI on every PR, a security-fix ledger, and file-integrity checks.
Disciplined one-slice-per-PR workflow (~99 feature slices, many split into
backend/app sub-slices, merged to `main`).

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
location or set via address → coordinates geocoding.

**Quoting & payments.** The assigned worker proposes a price **quote** (amount +
note); the owning customer accepts or declines; payment is **gated server-side**
on an accepted quote of the matching amount (mock/sandbox payments only — no real
money moves). A NT$1 minimum is enforced on quotes and payments. Customers and
workers each have a **payment history** view (paid/received).

**Real-money groundwork (provider-agnostic, mock by default).** We chose a
**Model B marketplace split**: each payment is split at creation into a **platform
commission** (`PLATFORM_FEE_BPS`, default 15%) and the **worker's net**, surfaced
in the app (payment history + request detail). Payment confirmation runs through a
**provider-webhook seam** — `POST /webhooks/payments`, verified by a shared secret
(`PAYMENTS_WEBHOOK_SECRET`; in production an unset secret rejects all webhooks so
nothing confirms by accident), idempotent, the seam a real provider (Stripe
Connect / PayPal / Adyen, or a TW provider) would call in place of the mock
checkout. **Refunds** exist end-to-end: an admin can refund a paid payment (the
job can then be re-pooled), the webhook also handles `payment.refunded`, and the
app shows a `refunded` state + an admin Refund action. **Payouts** complete the
mock money flow: every paid payment schedules a **pending payout** of the worker's
net, settled via a `payout.paid` webhook (idempotent), with a **worker payout-
history screen** (persisted to Postgres, migration 0027). All audited; still no
real money. The mock flow (split → confirm → refund → payout) is complete;
**remaining real-money work is a real provider adapter** — intent creation with a
client secret, a stored provider reference to map webhooks back to our
payment/payout, and raw-body signature verification — deferred by project rule
until a provider is actually wired.

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
provider. The in-app **message thread updates live** by polling while it is open
(chosen over a WebSocket to avoid new infrastructure; a true-push upgrade remains
optional).

**Persistence & DB hardening.** All domains (requests, audit, reviews,
notifications, users, favorites, messages, payments, quotes, device tokens,
payouts) run on Postgres via SQL migrations `0001`–`0028`, run automatically on
boot (a multi-statement-capable runner), with an in-memory fallback for tests/dev.
The schema is hardened with **indexes** on filtered columns (0016), **CHECK
constraints** enforcing the domain enums/ranges (0017), and **foreign keys** across
the graph (0018–0021, added `NOT VALID` so they enforce new writes without a
boot-time scan of legacy rows). Later migrations add `users.token_version` (0022),
`password_reset_tokens` (0023), `users.status` (0024), the payment
`platform_fee_cents` split (0025), the `refunded` payment status (0026), the
`payouts` table (0027), and per-user `users.notify_email/notify_push` preferences
(0028).

**Apps.** Full three-role Expo React Native app: registration, login/session
persistence (SecureStore on native, localStorage on web), and role-specific
stacks for customer, worker, and admin, all wired to the API.

**Operational hardening & deploy.** Production CORS allowlist (SEC-0002); the
server refuses to boot in production with the default JWT secret (SEC-0004); demo
users are not seeded in production by default; a `GET /ready` readiness probe that
checks the database; structured per-request access logging with request-id
correlation; a dev-dependency-free production image (`tsc` build, no `tsx` at
runtime); deploy artifacts (`Dockerfile`, `.dockerignore`, `.env.example`,
deployment guide). **The API is LIVE on Railway** (multi-stage Docker build +
managed Postgres plugin; `/health` and `/ready` green; migrations applied on
boot).

## 3. What a testable v1 still needs

These are the gaps between "deployed, feature-rich internal build" and "a build
real test users could exercise":

1. **Public frontend deploy.** The API is live, but the Expo app is not yet hosted
   as a public web app. The web build/export pipeline is merged (slice 99 —
   `app-expo` builds a static `dist/` pointing at the Railway API); it still needs
   the `dist/` hosted (e.g. Netlify) and the backend `CORS_ALLOWED_ORIGINS`
   pointed at that origin. Web runtime guards for native-only modules
   (push/location) to be confirmed once hosted.
2. **Real payment-provider adapter.** The full mock money flow (split → webhook
   confirm → refund → payout) is done; a real provider still needs intent creation
   (client secret), a stored provider reference to map webhooks back to our
   payment/payout, and raw-body signature verification. Mock/sandbox by project
   rule until a provider is wired.
3. **Map / place picker.** Location can be auto-filled from the device or set by
   address search, but there is still no interactive map picker.
4. **End-to-end + device QA.** Unit/integration coverage is strong (and a QA
   checklist exists at `docs/qa-checklist.md`); there is no full E2E run on a real
   device/build, nor accessibility/performance passes.
5. **Production observability & backups.** Managed Postgres is provisioned on
   Railway; log shipping/observability and a backup policy are not yet set up.

## 4. How far to a testable v1

- **Internal alpha, deployed (reached).** Sign-up, full three-role loop,
  category matching, quoting + mock payments, real (config-gated) notification
  delivery, ops hardening, and a **live API on Railway** are done — the team can
  exercise every flow against the hosted backend.
- **Closed test (friendly users).** Host the frontend web app, add a map/place
  picker, and per-user notification preferences.
- **Payments-enabled test.** Quote + mock payment + server-side gate + payment
  history already exist; add receipts/order state as needed (still no real money,
  per project rules).
- **Production-hardened.** API is deployed with managed Postgres; remaining:
  observability/backups and an E2E/device QA pass.

**Bottom line:** the hardest, riskiest parts — the domain model, authorization,
state machine, concurrency, persistence, quoting/payment integrity, the
three-role app loop, notification delivery, and a live deployment — are **done,
tested, and hardened**. A small, well-scoped set of slices (host the frontend,
map picker, notification preferences, then an E2E pass) gets to a genuinely
testable v1.

## 5. Recommended next slices (in order)

1. **Host the frontend web app** — deploy the merged `app-expo/dist`, set
   `CORS_ALLOWED_ORIGINS` to the frontend origin, and verify the login loop on
   web (guard native-only push/location/map calls behind `Platform.OS`).
2. **Backups & log shipping** for the Railway deployment (managed Postgres backup
   policy, ship the structured logs somewhere queryable). Structured 5xx error
   logging is done.
3. A full **E2E / device QA** pass against `docs/qa-checklist.md`.
4. **Real payment go-live** — the Stripe adapter (slice 129), webhook resolution
   (by `providerRef`), and HMAC verification are all done; going live is now an
   operator step: set `STRIPE_SECRET_KEY` + `PAYMENTS_WEBHOOK_SECRET`, point
   Stripe's webhook at `/webhooks/payments`, and test with a `sk_test_…` key.
5. **WebSocket true-push chat** — optional upgrade over the current polling.
6. **Further audit coverage** — auth/profile actions (password change, profile
   edits) not yet audited.

## 6. Slice ledger since the last snapshot (110c–117)

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
  **⚠️ STILL not fully production-ready:** the real Stripe checkout PROVIDER isn't
  wired yet (130c) — `App.tsx` passes no `checkout`, so in real mode "Pay now" hits
  the mock `/pay` (which 409s). Remaining 130c: a native `@stripe/stripe-react-native`
  PaymentSheet + web Stripe.js provider, wired in `App.tsx`, plus a publishable key
  (`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`). Keep `STRIPE_SECRET_KEY` unset until 130c.

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

_All slices above are merged to `main` except **134** (auth audit), which was
handed off. The service is deployed and ACTIVE on Railway in mock mode (no Stripe
key)._

_Prior snapshot (100–110b): SEC-0005 billing consistency; DB hardening (indexes /
CHECK / foreign keys, migrations 0016–0021); account lifecycle end-to-end (104–108);
payment split + webhook seam + refunds (109–110b)._
