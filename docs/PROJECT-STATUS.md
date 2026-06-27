# HomeFix — Project Status & Road to a Testable v1

_Snapshot as of 2026-06-27. Compiled against the original vision: an Uber-like
home-repair marketplace with three roles (customer, worker, admin), a request
lifecycle, worker matching, quoting, payments, reviews, and messaging._

## 1. Where we are in one sentence

The **marketplace engine is built, tested end-to-end, and now hardened for
operation** — a customer can sign up, post a repair request, get matched (admin
assignment or a worker self-claiming), receive and accept a worker's price quote,
pay the agreed amount, message the other party, and review the worker — all
persisted to Postgres, behind server-side authorization, and covered by an
extensive test suite. We are at **internal alpha**, with the main gaps to a
real-user test build being **real notification delivery, a map/place picker,
category-based matching, and an actual deployment + E2E pass** — not core domain
logic.

## 2. What is done

**Foundation & quality.** TypeScript-strict monorepo (`shared` / `server` /
`app` logic / `app-expo` UI), ESLint + Prettier + typecheck + tests as enforced
quality gates, CI on every PR, a security-fix ledger, and file-integrity checks.
Disciplined one-slice-per-PR workflow (~140 merged slices).

**Auth & identity.** Account **sign-up** (`POST /auth/register`) and JWT login
with scrypt-hashed passwords; `authenticate` on every protected route;
server-side authorization throughout (request parties, owner-only actions,
admin-only endpoints); auto sign-out on token expiry; rate limiting on the
unauthenticated auth endpoints. User profiles with display name and contact
phone (phone exposed only to a request's parties).

**Request lifecycle.** Create → match → accept → in_progress → completed, with a
guarded status state machine, cancellation (with reason), photos, a status/audit
timeline, keyword search, status filter, pagination (Load more), and
pull-to-refresh.

**Matching.** Admin assignment **and** worker self-serve claiming of pending,
unassigned requests. Both paths are **atomic** (a single conditional update), so
two workers racing for the same request can never both win. Request location can
be auto-filled from the device's current location.

**Quoting & payments.** The assigned worker proposes a price **quote** (amount +
note); the owning customer accepts or declines; payment is **gated server-side**
on an accepted quote of the matching amount (mock/sandbox payments only — no real
money moves). A NT$1 minimum is enforced on quotes and payments.

**Supporting domains, each backend + Postgres + app UI.** Reviews & worker
ratings (aggregated in SQL), in-app notifications with unread badge, favorite
workers, and an in-app message thread per request.

**Notification delivery.** Notifications fan out to email/push delivery channels
behind a `NotificationDelivery` interface, configured by `NOTIFY_CHANNELS`, with
per-channel failure isolation. The channels are **recording mocks** today (no
real provider is contacted), ready for a real provider to be dropped in.

**Persistence.** All eight domains (requests, audit, reviews, notifications,
users, favorites, messages, payments) plus quotes run on Postgres via SQL
migrations `0001`–`0010`, with an in-memory fallback for tests/dev.

**Apps.** Full three-role Expo React Native app: registration, login/session
persistence, and role-specific stacks for customer, worker, and admin, all wired
to the API.

**Operational hardening.** Production CORS allowlist (SEC-0002); the server
refuses to boot in production with the default JWT secret (SEC-0004); a
`GET /ready` readiness probe that checks the database; structured per-request
access logging with request-id correlation; and deploy artifacts (`Dockerfile`,
`.dockerignore`, `.env.example` aligned to the real env schema, and a deployment
guide).

## 3. What a testable v1 still needs

These are the gaps between "feature-rich, hardened internal build" and "a build
real test users could exercise":

1. **Real notification delivery.** Delivery is wired but the channels are mocks;
   no message actually reaches a user's inbox/device yet. Plug a real email/push
   provider in behind the existing interface.
2. **Map / place picker.** Location can be auto-filled from the device, but there
   is still no map or place-search picker for choosing a request's location.
3. **Category-based matching.** Self-serve matching exists, but workers cannot yet
   filter the available-requests list by trade/category.
4. **End-to-end + device QA.** Unit/integration coverage is strong; there is no
   full E2E run on a real device/build, nor accessibility/performance passes.
5. **Live deployment.** Build artifacts exist, but a managed Postgres, log
   shipping/observability, and an actual deploy target are not yet provisioned.

## 4. How far to a testable v1

- **Internal alpha (reached).** Sign-up, full three-role loop, quoting + mock
  payments, and ops hardening are done — the team can click through every flow on
  a real build.
- **Closed test (friendly users).** Add real notification delivery, a map/place
  picker, and category-based matching.
- **Payments-enabled test.** Quote + mock payment + server-side gate already
  exist; add receipts and any remaining order/payment state as needed (still no
  real money, per project rules).
- **Production-hardened.** Most ops work is done; remaining: a deploy target +
  managed Postgres, observability, and an E2E/device QA pass.

**Bottom line:** the hardest, riskiest parts — the domain model, authorization,
state machine, concurrency, persistence, quoting/payment integrity, and the
three-role app loop — are **done, tested, and hardened**. A small, well-scoped
set of slices (real notification provider, map picker, category filter, then a
deploy + E2E pass) gets to a genuinely testable v1.

## 5. Recommended next slices (in order)

1. **Real notification provider** behind `NotificationDelivery` (config-gated; no
   real send without credentials), so notifications actually reach users.
2. **Category filter** on the available-requests list (backend query param +
   app chips) to make self-serve matching practical.
3. **Map / place picker** feeding request coordinates.
4. **Per-user notification preferences** (which channels a recipient wants).
5. **Deploy + managed Postgres + observability**, then a full **E2E / device QA**
   pass.
