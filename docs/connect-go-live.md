# Stripe Connect Payouts Go-Live Runbook

Paying workers for real, over **Stripe Connect** (Express connected accounts + platform
transfers). The code is complete; this is an **operator procedure** — you supply the keys,
onboard a real worker, and watch the money move. **Nothing here is exercised in CI**: every
Connect call is mocked or injected in tests, so this dry run is the only thing that proves
the integration actually works.

> Secrets are operator-supplied and never committed. Set them as service variables on the
> deploy platform (e.g. Railway), not in the repo. Do a full **test-mode** dry run before
> switching to live keys.

Read `docs/stripe-go-live.md` first — payouts only matter once payments are settling, and
Connect reuses the same `STRIPE_SECRET_KEY`.

## How the flow works (what the config switches on)

1. **Onboarding.** A worker taps **"Set up payouts"** in the app → `POST /me/connect/onboard`
   (worker-only) creates an **Express** connected account (requesting the **`transfers`**
   capability) or reuses their existing one, stores the `acct_…` id on the user, and returns
   a Stripe-hosted onboarding URL the app redirects to.
2. **Verification.** The worker completes Stripe's hosted form. Stripe then decides whether
   the account may receive money.
3. **Confirmation.** Stripe sends **`account.updated`** to `POST /webhooks/connect`
   (signature-verified). We record the account's **`payouts_enabled`** on the worker.
4. **Transfer.** When a payment settles, the worker's net is scheduled as a payout and
   **transferred immediately** — but **only** if payouts are configured **and** the worker
   has a connected account **and** `payouts_enabled` is true. Otherwise the payout is left
   `pending`.
5. **Backfill.** When `account.updated` flips `payouts_enabled` to true, every payout still
   `pending` for that worker is retried — so jobs paid _while_ they were onboarding get
   flushed automatically.

With no Connect configuration, none of this runs: payouts are simply scheduled `pending` and
nothing moves (the pre-Connect behaviour).

## Required environment

| Variable                        | Value                            | Notes                                                                                                                                      |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`             | `sk_test_…` then `sk_live_…`     | Shared with payments. Also turns on the payout **sender** (transfers).                                                                     |
| `STRIPE_CONNECT_RETURN_URL`     | app URL, e.g. `…/?payouts=done`  | Where Stripe returns the worker after the onboarding flow. **Required** to enable onboarding.                                              |
| `STRIPE_CONNECT_REFRESH_URL`    | app URL, e.g. `…/?payouts=retry` | Used when the onboarding link expires. **Required.**                                                                                       |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_…`                        | From the **Connected accounts** webhook below. **Distinct from `STRIPE_WEBHOOK_SECRET`.** Until it is set, `/webhooks/connect` is **404**. |

App build (Expo, **build-time**):

| Variable                              | Value  | Notes                                                                         |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED` | `true` | Shows the worker "Set up payouts" button. Inlined at build → needs a rebuild. |

## Before you start

- **Connect must be enabled** on the Stripe account (Dashboard → Connect → get started).
- **Settlement currency must be USD.** The platform is US-denominated (`PLATFORM_CURRENCY`),
  and a transfer must be in the platform's settlement currency. If your Stripe account settles
  in something else, transfers will fail — fix that before going further.
- **The platform needs an available balance.** Transfers move funds from your platform balance
  to the worker's account. In test mode Stripe funds this for you; in live mode a payment must
  have actually settled (and cleared) before its payout can be transferred.

## Procedure

### 1. Enable Connect and create the webhook (test mode)

1. Work inside the same **Sandbox** you used for payments (Stripe replaced the old
   _Test mode_ toggle with Sandboxes). Dashboard → **Connect** → enable it (platform
   profile, business details).
2. **Workbench** → **Webhooks** tab → **Create new destination**, with
   **Events from: Connected accounts**. This is a **separate destination** from your
   payments webhook and gets its **own signing secret** — using the payments one here
   gives a 401 on every delivery.
   - Endpoint URL: `https://<your-host>/webhooks/connect`
   - Event types: **`account.updated`** (only that one is needed)
3. Copy the destination's **Signing secret** (`whsec_…`) → `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. **Verify the destination is actually Connect-scoped.** This is the single easiest thing to
   get wrong, and it fails _invisibly_: an endpoint scoped to **Your account** looks completely
   healthy — right URL, right events, status `enabled`, no errors — and is simply never sent a
   **connected** account's `account.updated`. There are no failed deliveries to find, because
   there are no deliveries. The only reliable proof is the `application` field:

   ```bash
   curl -s https://api.stripe.com/v1/webhook_endpoints -u sk_test_...:
   ```

   The Connect destination must show a **non-null `"application": "ca_…"`**. If it is
   `"application": null`, it is account-scoped — delete it and create it again with
   `connect=true` (or, in the dashboard, **Events from: Connected accounts**).

### 2. Set the variables and redeploy

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CONNECT_RETURN_URL=https://<your-host>/?payouts=done
STRIPE_CONNECT_REFRESH_URL=https://<your-host>/?payouts=retry
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

Then **rebuild the web/app bundle** with `EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED=true` (it is a
Docker build arg — a restart is not enough, the value is inlined at build time).

Confirm `GET /ready` is 200 and that a worker now sees the **"Set up payouts"** button.

**Pre-flight the endpoint before you touch the flow:**

```bash
curl -i -X POST https://<your-host>/webhooks/connect
```

- **400** — armed. The route is live and rejected the unsigned body. This is what you want.
- **404** — the route does not exist, i.e. `STRIPE_CONNECT_WEBHOOK_SECRET` never reached the
  server (the handler is config-gated). Fix this now; every delivery would 404 in silence.

### 3. Test-mode dry run

1. As a **worker**, tap **"Set up payouts"**. You should be redirected to Stripe's hosted
   onboarding.
2. Complete the form with Stripe's **test values** — see
   [Testing Connect](https://docs.stripe.com/connect/testing) for the current test SSN, DOB,
   address and bank-account numbers. When prompted for an SMS code, use **`000-000`**.
3. You are returned to `STRIPE_CONNECT_RETURN_URL`. **Returning does NOT mean onboarding is
   complete** — it only means the flow was exited properly. The authority is the webhook.
4. In the Stripe dashboard, confirm the **`account.updated`** delivery to `/webhooks/connect`
   shows **200**, and that the connected account shows **Payouts: enabled** (and the
   `transfers` capability **active**).
5. **Fund the platform's available balance first.** A transfer is paid out of the platform's
   **available** balance, and test-mode card payments land in **pending** for days — so a
   sandbox platform typically has `available: 0` and **every transfer fails for insufficient
   funds**. Because payouts are best-effort, they just stay `Pending` and nothing says why.
   Top up directly, with the test token whose funds skip the pending period:

   ```bash
   # $4,000 straight into the available balance. Comfortably covers the payouts under test.
   curl https://api.stripe.com/v1/charges -u sk_test_...: \
     -d amount=400000 -d currency=usd -d source=tok_bypassPending

   curl -s https://api.stripe.com/v1/balance -u sk_test_...:   # available[0].amount
   ```

   Do **not** top up by running payments through the app: each one creates a _new_ payout for
   the worker that is at least as large as the amount charged, so the available balance only
   grows by the platform fee. You will never catch up.

6. As a **customer**, drive a request through to a **paid** payment for that worker.
7. Confirm on the worker's **Payouts** screen that the payout is **Paid out** (not Pending) —
   this proves the transfer actually fired. Cross-check in the Stripe dashboard: a **Transfer**
   to the connected account for the worker's net.
8. **Backfill check:** pay a job for a worker who has _not_ finished onboarding — the payout
   should sit **Pending**. Then finish their onboarding; once `account.updated` arrives, that
   pending payout should flip to **Paid out** on its own.

   If the account is _already_ fully onboarded, Stripe will not send another `account.updated`
   on its own. Force one by touching the account — the webhook fires, and the backfill runs:

   ```bash
   curl -s https://api.stripe.com/v1/accounts/acct_... -u sk_test_...: -d "metadata[ping]=1"
   ```

### 4. Go live

1. Only after the test-mode run passes end-to-end: switch to **Live mode**, create the
   **Connected accounts** webhook again (new `whsec_…`), and use the live `sk_live_…`.
2. Update `STRIPE_SECRET_KEY` and `STRIPE_CONNECT_WEBHOOK_SECRET` to the live values; keep the
   same return/refresh URLs. Redeploy.
3. Onboard **one real worker** and run **one small real job** end-to-end. Confirm the transfer
   lands in their account, then refund it from the app (admin) to verify the refund path
   reverses the payout.

## Rollback / kill switch

To stop sending payouts immediately, **unset `STRIPE_CONNECT_WEBHOOK_SECRET`** (disables
`/webhooks/connect`, so no account ever becomes payouts-enabled) and/or unset
`STRIPE_SECRET_KEY` (also disables charges). Payouts then simply accumulate as `pending` —
nothing is lost, and they will flush once the configuration is restored and `account.updated`
arrives. Note that already-enabled workers keep their `payouts_enabled` flag, so if you want
to fully stop transfers while keeping payments on, unset the key or rebuild the app without
`EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED`.

## Gotchas (each of these has bitten us or is designed around)

- **The `transfers` capability must be requested** when the account is created. A Stripe
  capability is inactive until requested and verified — without it `payouts_enabled` never
  turns true and **every payout sits `pending` for ever, silently**. We request it in
  `EXPRESS_ACCOUNT_PARAMS` (slice 171); do not remove it. We deliberately do **not** request
  `card_payments` — the worker only receives transfers.
- **`return_url` does not mean "onboarding complete."** Stripe redirects the worker back
  whenever the flow is exited properly, even with requirements outstanding. Only
  `account.updated` / `payouts_enabled` is authoritative — which is exactly why we gate the
  transfer on it rather than on the redirect.
- **Account links are single-use.** Each onboarding URL can only be used once; tapping
  "Set up payouts" again mints a fresh link and reuses the same `acct_…`.
- **The Connect webhook secret is not the payments webhook secret.** Two endpoints, two
  secrets. Using the wrong one gives a 401 on every delivery.
- **A wrongly-scoped webhook endpoint fails silently.** Scoped to "Your account" instead of
  "Connected accounts", the endpoint looks perfectly healthy and is simply never sent the
  event. Nothing is broken — nothing is delivered. Check `application` is a `ca_…`, not `null`
  (see step 1.4). This cost hours in the first dry run.
- **The platform needs an available balance to transfer from.** No balance → the transfer
  fails → the payout stays `pending`, by design and without complaint. Symptomatically this is
  indistinguishable from "the webhook never arrived", so rule the balance out first (see step
  3.5). In production this is normally self-solving (real charges settle into the balance), but
  watch it if you pay out faster than you settle.
- **Currency must match settlement.** Transfers are sent in `PLATFORM_CURRENCY` (USD).
- **Refunds interact with payouts (SEC-0007/0008).** Refunding a payment removes a still-
  pending payout; if the worker was **already paid out**, the admin refund is **blocked (409)**
  and needs a manual clawback. Expect that during the dry run if you refund late.

## Guardrails

- Never commit any `sk_…` or `whsec_…` value; platform variables only.
- Do not enable live keys until the full test-mode loop passes, including the backfill check.
- The payout sender is config-gated and inert by default, so a removed/empty key is safe: it
  degrades to "schedule pending, transfer nothing", it does not move money.
- See `docs/security-fixes.md` (SEC-0007/0008) for the refund↔payout integrity guarantees.
