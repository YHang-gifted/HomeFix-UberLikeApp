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

### Database backups and recovery — BLOCKED (Railway plan)

**None of this is enabled.** The current Railway plan does not offer it. See
`docs/backups.md` for the mechanisms and their footguns.

- [ ] Scheduled volume snapshots: **Daily + Weekly** (Backups tab).
- [ ] **Point-in-Time Recovery.** The important one: migrations run **automatically on
      boot**, so a faulty migration mutates production the moment a deploy lands.
      Snapshots only rewind to last night; PITR rewinds to the minute before it ran.
- [ ] Run the **restore drill** in `docs/backups.md` once, end to end, and record the
      measured RTO there.

> ⚠️ **The PITR window is not retroactive.** It begins at the first base backup _after_ you
> enable it. Enabling it the day you need it is enabling it too late. When the plan is
> upgraded, do this **first**, before anything else on this list.

Until this is done, **the production database has no recovery story.** That is acceptable
for an internal alpha with test data. It is not acceptable the moment a real customer's
job, payment, or payout is in it.

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
- [ ] **`METRICS_TOKEN`** — unset today, which leaves `GET /metrics` **world-readable**.
      Aggregate data only (traffic, error rate, latency, RSS), so the blast radius is
      small, but it is unauthenticated telemetry on the public internet. `env.ts` does not
      require it in production; it should (same `superRefine` pattern as SEC-0004/0009).
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
- **In-app saved-card payments (Uber-style) — a planned redesign, not yet built.** Today
  payment redirects to Stripe's **hosted Checkout** (leave the app, pay, come back) — chosen
  because it keeps card data entirely off our servers, so we stay in the lightest PCI scope
  (SAQ A). The nicer experience — save a card once, then pay in-app in a tap, and see it on your
  monthly statement — is achievable **without** taking on card data, using Stripe's native
  `@stripe/stripe-react-native` **PaymentSheet** + a **Stripe Customer** + **SetupIntent**
  (save the card → store only the `payment_method` id + last4) + **off-session PaymentIntent**
  (charge the saved method). It is a real, multi-part slice: a new native module (another EAS
  build), the Customer/SetupIntent machinery server-side, and the PaymentSheet UI. Requested
  2026-07-15; not a blocker (hosted Checkout works). **Never collect raw card numbers in our
  own form** — that is the one line that must not be crossed (PCI liability).
- **No customer-facing dispute flow.** Refund and clawback exist as admin capabilities only.
- **Ratings do not feed matching.** Reviews are collected and shown, but do not influence
  ranking.
- **No graceful shutdown**, so in-flight requests are dropped on redeploy.
