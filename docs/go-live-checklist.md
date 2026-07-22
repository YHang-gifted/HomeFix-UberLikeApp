# Go-Live Checklist — before a real user touches this

Everything here is **deliberately deferred**, not forgotten. The build is an internal
alpha: it is deployed, it works, and several of the guarantees a real user is entitled to
are simply not switched on yet. This file is the single list of what must become true
before the app is opened to people who are not us — and, where something is blocked, why.

Nothing here is engineering work waiting to be designed. It is configuration, operator
action, and proof.

> **How to use this.** Work top-down: the blockers first — each one is a way a real user
> loses money, loses access, or loses data. Tick nothing you have not _observed_ working.

---

## 1. Blockers — a real user is harmed without these

### Password reset does not work at all

`EMAIL_API_URL` / `EMAIL_API_KEY` / `EMAIL_FROM` are unset, so the email channel falls
back to the inert sender: **`POST /auth/forgot-password` sends nothing.** Since SEC-0009 it
does not log the token either (correctly — it was an account-takeover hole). So today a
user who forgets their password has no way back into their account, and there is no
workaround.

**No code change is needed** — the sender already matches Resend's API. Follow
`docs/email-go-live.md`.

- [x] Set `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM` (all three, or the channel stays
      silently inert). **Done 2026-07-13 — the mail arrives.**
- [ ] Set `APP_PUBLIC_BASE_URL` so the mail carries a **clickable link** instead of a
      64-character code to copy by hand (slice 183).
- [ ] Verify a sending domain. Until then you can only send from `onboarding@resend.dev`, to
      your own address — which is fine for testing and **not enough to ship**.
- [ ] **Complete a real forgot-password → reset → log-in loop against the deploy.** Tick this
      only when you have logged in with the new password — not when the variables are set.
- [ ] _(Optional, separate decision)_ add `email` to `NOTIFY_CHANNELS` to also mail ordinary
      notifications. Password reset does **not** need it.

This is the single most user-facing gap in the product, and it is pure configuration.

### Database backups and recovery — PITR live, drill passed (2026-07-22)

The Railway plan was upgraded and recovery is now enabled. See `docs/backups.md` for the
mechanisms, their footguns, and the drill procedure.

- [x] **Point-in-Time Recovery — enabled 2026-07-22.** The important one: migrations run
      **automatically on boot**, so a faulty migration mutates production the moment a deploy
      lands. Snapshots only rewind to last night; PITR rewinds to the minute before it ran.
- [x] **Restore drill run end to end (2026-07-22).** A PITR fork was provisioned and all six
      spot-checked tables (`users`, `service_requests`, `quotes`, `payments`, `payouts`,
      `audit_events`) matched the source row-for-row. **Measured RTO ≈5–10 min**, recorded in
      `docs/backups.md`.
- [ ] Confirm scheduled volume snapshots are on **Daily + Weekly** (Backups tab). Belt-and-
      braces alongside PITR — a wiped volume takes its own backups with it, so this is not
      redundant. Not a recovery blocker; PITR already gives a bad-migration recovery path.

> ⚠️ **The PITR window is not retroactive.** It only covers time since it was enabled
> (2026-07-22), so leave it on — do not stage-disable it.

The production database now has a proven recovery story for the failure this project is most
exposed to (a bad auto-run migration). Re-run the drill after any change to the schema-
migration flow.

### Purge the historical logs (SEC-0009 residue)

Before SEC-0009, every `POST /auth/forgot-password` wrote the **plaintext reset token and
the user's email address** into the application log. The tokens are 1-hour TTL and
single-use, so anything already logged is almost certainly dead — but the **email addresses
are still there**, and the logs are retained.

- [ ] Clear the Railway log retention window (or the drain's index, if one is configured by
      then).

---

## 2. Money — do not take a real payment until these are true

The Stripe line has been **proven end to end against a sandbox** (payments, Connect
payouts, and the backfill). PayPal has not met a real provider at all.

- [ ] **PayPal sandbox dry run** — `docs/paypal-go-live.md`. The Stripe run found three
      defects that had passed every test we have (171, 172, 178). Assume PayPal is hiding
      some too; that is the entire argument for doing this.
- [ ] Live keys + live webhook endpoints, per `docs/stripe-go-live.md`,
      `docs/paypal-go-live.md`, `docs/connect-go-live.md`.
- [ ] **One small real job, end to end, with real money** — pay, settle, payout, then
      refund it — before opening to anyone else.
- [ ] Connect webhook endpoint created with **`connect=true`**. An endpoint scoped to "Your
      account" looks perfectly healthy and is simply never sent a connected account's
      `account.updated`. This cost hours in the dry run.

---

## 3. Security & operations configuration

- [ ] **Push notification credentials** — push is wired in the app and the code is confirmed
      correct (slice 186's diagnostic reached the _next_ error on a real device), but no
      provider credentials exist, so push does not send. Android needs **FCM**: a Firebase
      project with an Android app for `com.homefix.dev`, a `google-services.json` referenced
      from the app config, and the FCM V1 key uploaded to Expo
      (`docs/device-build.md`, https://docs.expo.dev/push-notifications/fcm-credentials/). iOS
      needs **APNs**, which comes with the Apple Developer account. Not a blocker — the app
      degrades to no-push cleanly — but email is the only working channel until this is done.
- [x] **`METRICS_TOKEN`** — **now required in production (SEC-0011).** `env.ts` refuses to boot
      without it when `NODE_ENV=production`, so `/metrics` can no longer be left world-readable by
      forgetting to set the token (same `superRefine` pattern as SEC-0004/0009). **Operator action:**
      set `METRICS_TOKEN` as a Railway service variable, or the app will fail fast on the next deploy;
      scrape with `Authorization: Bearer <token>`.
- [ ] **Log drain** — logs are safe to ship since SEC-0009. Point Railway's Log Drain at
      something queryable (`docs/deployment.md`).
- [ ] **Alerting** — none exists. At minimum: `/ready` failing, and the 5xx rate.
- [ ] `CORS_ALLOWED_ORIGINS` — not required while the web app is served **same-origin** by
      the API (it is). Set it if the frontend is ever hosted separately (SEC-0002).

Already enforced at boot, so they cannot be got wrong — listed only so nobody re-checks
them by hand:

- `JWT_SECRET` must be non-default in production (SEC-0004).
- `NOTIFY_LOG_BODY` must not be enabled in production (SEC-0009).

---

## 4. Proof

- [x] **The app runs on a real device** (Android, 2026-07-14). First device run ever: login,
      create-request end-to-end against the live API, location capture, and "Open in Maps" all
      work; found and fixed a header that overflowed narrow screens (slice 188); the push
      diagnostic correctly identified the missing FCM credentials. See `docs/device-build.md`.
- [ ] Full **E2E / device QA** pass against `docs/qa-checklist.md` — the smoke path is proven;
      still outstanding: the in-app map **picker** (needs a `preview` build or a local key, not
      the dev server), push once FCM is set up, photo upload, and an **iOS** run. No
      accessibility or performance pass yet.
- [ ] Confirm the deployed **web app renders in a browser** and the console is clean. (Done
      once, 2026-07-13 — keep it as a release check: a zod 3-vs-4 mismatch once blanked the
      whole page for several slices and nothing in CI noticed, because CI proves the bundle
      is _produced_, never that it _renders_.)

---

## 5. Known product gaps (not blockers — decide, don't drift)

- ~~**Payouts screen** still offers "Set up payouts" after the worker is already onboarded.~~
  **Fixed in slice 184** — it now reads the account status and distinguishes three states,
  including the half-finished one that explains why earnings are being held.
- **In-app saved-card payments (Uber-style) — IN PROGRESS (Phase 3 remains).** Approach is
  **Option B**: the card is saved via a one-time hosted Checkout Session in `mode: 'setup'`
  (reusing the proven hosted-checkout infra — raw card data never touches us, lightest PCI
  scope), attached to a per-customer **Stripe Customer**; the saved card is later charged via an
  **off-session PaymentIntent**. Option B replaces the originally-planned native PaymentSheet +
  SetupIntent + Ephemeral Key path, whose apiVersion coupling is fragile and untestable in the
  sandbox. Progress:

  - **Phase 1 (slice 193, done):** wired the `@stripe/stripe-react-native` SDK (`StripeProvider`
    at the root, web-split so the web bundle is untouched).
  - **Phase 2a (server, done):** migration `0039` `users.stripe_customer_id`; get-or-create
    Stripe Customer; `POST /me/payment-methods/setup` (hosted setup Checkout) + `GET
/me/payment-methods` (list saved cards, safe fields only). Config-gated, mock-by-default.
  - **Phase 2b (app, done):** a **Payment methods** screen (reached via "Cards" on the customer
    home) that lists saved cards and offers "Add a card" → opens the hosted setup URL. Gated on
    `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`. **Needs an EAS rebuild to device-test** (new screen is
    JS-only, but ships in the next build).
  - **Phase 3 (to come):** pay with a saved card — off-session PaymentIntent, with the SCA
    `requires_action` fallback handled by the native SDK's `handleNextAction`.

  Config: `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` must be set (in `eas.json` env for builds and
  `app-expo/.env` for local Metro) — a **publishable** key (`pk_…`), safe to ship. **Never
  collect raw card numbers in our own form** — the one line that must not be crossed (PCI
  liability). Not a blocker; hosted Checkout still works for one-off payments.

- ~~**No customer-facing dispute flow.** Refund and clawback exist as admin capabilities only.~~
  **Shipped (slices 199–202).** A customer files a refund request on a paid payment; an admin
  approves it (reusing the existing refund line — payout reversal included) or rejects it with a
  reason. Both ends have UI (RequestDetailScreen / AdminRefundRequestsScreen), the customer is
  notified, and every step is audited. Payout note still applies: an approved refund can only be
  clawed back automatically while the worker's payout is still pending; once paid out it needs a
  manual clawback (the approval 409s in that case rather than half-refunding).
- **Ratings do not feed matching.** Reviews are collected and shown, but do not influence
  ranking.
- ~~**No graceful shutdown**, so in-flight requests are dropped on redeploy.~~ **Fixed.** On
  `SIGTERM`/`SIGINT` the server stops accepting connections, closes live WebSocket sockets, drains
  in-flight HTTP requests, then exits — with a timeout that forces exit if draining hangs
  (`server/src/lifecycle/gracefulShutdown.ts`).
