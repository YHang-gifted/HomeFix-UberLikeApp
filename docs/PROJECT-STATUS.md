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

0. ~~**[BUG — billing consistency] A paid request can still be cancelled.**~~ **Fixed
   in slice 144 (SEC-0006)** — `updateServiceRequestStatus` now calls `assertNotPaid`
   before a `→ cancelled` transition (422 on a paid payment), mirroring the SEC-0005
   release/reset guard; the app hides the cancel control when paid. ~~Admin
   "cancel + refund" remains a separate future capability.~~ **Built in slice 145** —
   admin `POST /service-requests/:id/cancel` refunds the paid payment, reverses the
   worker's pending payout, then cancels (409 if the worker was already paid out —
   manual clawback).
1. **Host the frontend web app** — deploy the merged `app-expo/dist`, set
   `CORS_ALLOWED_ORIGINS` to the frontend origin, and verify the login loop on
   web (guard native-only push/location/map calls behind `Platform.OS`).
2. **Backups & log shipping** for the Railway deployment (managed Postgres backup
   policy, ship the structured logs somewhere queryable). Structured 5xx error
   logging is done.
3. A full **E2E / device QA** pass against `docs/qa-checklist.md`.
4. **Real payment go-live** — the full Stripe hosted-Checkout flow is now done:
   backend Checkout Session (130c), app redirect (130d), and the signed
   `checkout.session.completed` webhook that settles the payment (130e). Going live
   is an operator step: set `STRIPE_SECRET_KEY`, `STRIPE_CHECKOUT_SUCCESS_URL`,
   `STRIPE_CHECKOUT_CANCEL_URL`, and `STRIPE_WEBHOOK_SECRET`, point Stripe's
   dashboard webhook at `/webhooks/stripe`, and test end-to-end with a `sk_test_…`
   key before switching to live keys. The full sequenced procedure (test-mode dry run →
   live switch → rollback) is now written up in **`docs/stripe-go-live.md`** (152).
5. ~~**WebSocket true-push chat** — optional upgrade over the current polling.~~ **Done**
   (122a–d + 125): `server.ts` attaches the message WebSocket, `messageService` publishes
   to the hub, and `MessagesScreen` consumes the live `connectStream` wired in `App.tsx`
   on both platforms (with reconnect/backoff); polling remains only as the fallback when
   no stream is injected (e.g. tests).
6. **Further audit coverage** — ~~password change, profile edits, sessions-revoked,
   account delete/suspend/reinstate, login and registration, failed logins~~ **all
   audited** (login/registration in 149; failed logins in 151 via a nullable-actor
   schema). Audit coverage of auth/account actions is complete.

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

_All slices above are merged to `main` except **134** (auth audit) and **152**
(Stripe go-live runbook), which were handed off. The service is deployed and ACTIVE on
Railway in mock mode (no Stripe key)._

_Prior snapshot (100–110b): SEC-0005 billing consistency; DB hardening (indexes /
CHECK / foreign keys, migrations 0016–0021); account lifecycle end-to-end (104–108);
payment split + webhook seam + refunds (109–110b)._
