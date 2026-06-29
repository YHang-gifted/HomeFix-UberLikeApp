# HomeFix — Project Status & Road to a Testable v1

_Snapshot as of 2026-06-28. Compiled against the original vision: an Uber-like
home-repair marketplace with three roles (customer, worker, admin), a request
lifecycle, worker matching, quoting, payments, reviews, and messaging._

## 1. Where we are in one sentence

The **marketplace engine is built, tested end-to-end, hardened for operation, and
the API is now live on a hosted environment** — a customer can sign up, post a
repair request, get matched (admin assignment or a worker self-claiming by
category), receive and accept a worker's price quote, pay the agreed amount,
message the other party, and review the worker (and read the worker's reply) —
all persisted to Postgres, behind server-side authorization, and covered by an
extensive test suite. We are at **internal alpha, deployed**, with the main gaps
to a real-user test build being **a public frontend deploy, a map/place picker,
per-user notification preferences, and a full E2E/device QA pass** — not core
domain logic, notification delivery, or a deploy target.

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
registered from the app and stored in Postgres.

**Persistence.** All domains (requests, audit, reviews, notifications, users,
favorites, messages, payments, quotes, device tokens) run on Postgres via SQL
migrations `0001`–`0015`, run automatically on boot, with an in-memory fallback
for tests/dev.

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
   as a public web app. The web build pipeline is ready (`app-expo` builds a
   static `dist/` pointing at the Railway API via `npm run export:web`); it still
   needs to be committed (slice 99) and the `dist/` hosted (e.g. Netlify), then
   the backend `CORS_ALLOWED_ORIGINS` pointed at that origin. Web runtime guards
   for native-only modules (push/location) to be confirmed once hosted.
2. **Map / place picker.** Location can be auto-filled from the device or set by
   address search, but there is still no interactive map picker.
3. **Per-user notification preferences.** Channels are config-gated globally; a
   recipient cannot yet choose which channels they receive.
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

1. **Host the frontend web app** — commit slice 99, deploy `app-expo/dist`, set
   `CORS_ALLOWED_ORIGINS` to the frontend origin, and verify the login loop on
   web (guard native-only push/location calls behind `Platform.OS`).
2. **Map / place picker** feeding request coordinates.
3. **Per-user notification preferences** (which channels a recipient wants).
4. **Observability & backups** for the Railway deployment (log shipping, managed
   Postgres backup policy).
5. A full **E2E / device QA** pass against `docs/qa-checklist.md`.
