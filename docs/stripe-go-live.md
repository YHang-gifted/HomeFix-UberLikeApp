# Stripe Go-Live Runbook

Taking real card payments through Stripe **hosted Checkout**. The code is ready; this
is an **operator procedure** — you supply the keys and run the test payments. Nothing
here is exercised in CI.

> Secrets are operator-supplied and never committed. Set them as service variables on
> the deploy platform (e.g. Railway), not in the repo. Do a full **test-mode** dry run
> before switching to live keys.

## How the flow works (what the keys switch on)

- With **no** `STRIPE_SECRET_KEY`, the payment provider is the inert **mock** — no real
  money, and the mock `POST /service-requests/:id/payment/pay` marks a payment paid
  (dev/test only).
- With `STRIPE_SECRET_KEY` set, the provider is **Stripe hosted Checkout**
  (`usesExternalCheckout`). Creating a payment returns a `checkoutUrl`; the app
  redirects the customer to Stripe's page. The mock `/pay` path is then **disabled**
  (returns **409**) so a payment can never be marked paid "for free".
- Settlement happens **only** via the signature-verified webhook: Stripe calls
  `POST /webhooks/stripe`, the `Stripe-Signature` header is verified against
  `STRIPE_WEBHOOK_SECRET`, and a `checkout.session.completed` event settles our payment
  by the `paymentId` carried in the session metadata (`confirmPaymentPaid`). With no
  `STRIPE_WEBHOOK_SECRET`, `/webhooks/stripe` is **disabled (404)** — so no payment can
  be confirmed by accident before you are ready.

Payouts of the worker's net are still the mock Model-B flow (a pending payout is
scheduled on settlement); wiring a real payout provider is a separate effort.

## Required environment (when going live)

| Variable                      | Value                          | Notes                                                                                           |
| ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`           | `sk_test_…` then `sk_live_…`   | Turns on the real provider.                                                                     |
| `STRIPE_CHECKOUT_SUCCESS_URL` | app URL + `?payment=success`   | **Required** when the secret is set; the server fails fast on boot otherwise.                   |
| `STRIPE_CHECKOUT_CANCEL_URL`  | app URL + `?payment=cancelled` | Required (as above).                                                                            |
| `STRIPE_WEBHOOK_SECRET`       | `whsec_…`                      | From the Stripe dashboard webhook you create below. Until it is set, `/webhooks/stripe` is 404. |

Point the return URLs at the deployed web app's public origin so the customer lands
back in the app after paying (e.g.
`https://homefix-uberlikeapp-production.up.railway.app/?payment=success`).

## Procedure

> **Dashboard note (verified 2026-07-12).** Stripe has replaced the old _Test mode_
> toggle with **Sandboxes**, and moved webhooks out of _Developers → Webhooks_ into
> **Workbench**. The steps below use the current UI. If you are following an older guide
> that says "Developers → Webhooks → Add endpoint", that path no longer exists.

### 1. Sandbox + test keys

1. In the Stripe Dashboard, open (or create) a **Sandbox** — this replaces the old
   Test-mode toggle. Everything below happens inside it; its keys are `sk_test_…`.
2. Copy the sandbox's **Secret key** (`sk_test_…`) from **Developers → API keys**.

### 2. Create the webhook destination (in the sandbox)

1. Open **Workbench** → the **Webhooks** tab → **Create new destination**.
2. **Events from:** choose **Your account**. (**Not** _Connected accounts_ — that is a
   separate destination with its own secret, used only for Connect payouts; see
   `docs/connect-go-live.md`.)
3. **Event types:** select **`checkout.session.completed`** (hosted checkout) **and
   `payment_intent.succeeded`** (the Uber-style saved-card path, which has no Checkout Session,
   settles only on this one). Both are required now; nothing else is needed. Settlement is
   idempotent, so a hosted-checkout payment firing both events is harmless.
4. **Destination type:** **Webhook** (an HTTPS endpoint).
5. **Endpoint URL:** `https://<your-host>/webhooks/stripe`
6. **Create destination**, then reveal and copy its **Signing secret** (`whsec_…`).

### 3. Set the variables (test mode) and redeploy

Set on the deploy platform (Railway → service → Variables), then redeploy so the server
picks them up:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_CHECKOUT_SUCCESS_URL=https://<your-host>/?payment=success
STRIPE_CHECKOUT_CANCEL_URL=https://<your-host>/?payment=cancelled
STRIPE_WEBHOOK_SECRET=whsec_...
```

On boot, confirm the server started (missing return URLs fail fast) and that
`GET /ready` is 200.

**Then check the webhook endpoint is actually live — before you touch any money:**

```bash
curl -i -X POST https://<your-host>/webhooks/stripe
```

- **400** (`Missing Stripe signature`) → the config landed and the endpoint is armed. ✅
- **404** → `STRIPE_SECRET_KEY` and/or `STRIPE_WEBHOOK_SECRET` did not reach the server.
  Stop here and fix that; do not go hunting for the problem mid-payment.

### 4. Test-mode dry run (do this before live)

1. As a customer, drive a request to an accepted quote, then start payment. The app
   should redirect to Stripe's hosted Checkout page (not the mock flow).
2. Pay with a Stripe **test card**, e.g. `4242 4242 4242 4242`, any future expiry, any
   CVC/ZIP.
3. Confirm you are returned to the app's success URL.
4. Confirm the payment shows **Paid** in the app — this proves the webhook fired and
   settled it (the mock `/pay` is disabled in this mode, so paid state can only come
   from the verified webhook). In the Stripe dashboard, the webhook delivery should show
   `200`.
5. Confirm a **pending payout** was scheduled for the worker (worker's Payouts screen).
6. Try the **cancel** path on Checkout: you should return to the cancel URL and the
   payment should **not** be paid.
7. Optional negative check: a direct `POST …/payment/pay` should return **409** while
   Stripe is active.

### 5. Go live

1. Only after the sandbox dry run passes end-to-end: leave the sandbox for your **live**
   account, create the webhook destination again the same way (Workbench → Webhooks →
   Create new destination — it gets a **new** `whsec_…`), and copy the **live** secret
   key (`sk_live_…`).
2. Update `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the live values; keep the
   same return URLs. Redeploy.
3. Do one **small real** transaction end-to-end and confirm settlement + payout, then
   refund it from the app (admin) to verify the refund path.

### Rollback / kill switch

To immediately stop taking real payments, **unset `STRIPE_SECRET_KEY`** (or set it
empty) and redeploy: the provider reverts to the inert mock and no card is charged.
Unsetting `STRIPE_WEBHOOK_SECRET` additionally makes `/webhooks/stripe` return 404.

## Guardrails

- Never commit any `sk_…` or `whsec_…` value; keep them in platform variables only.
- Do not enable live keys until the full test-mode loop passes.
- The provider seam is config-gated and mock-by-default, so an accidental empty/removed
  key is safe (it degrades to mock, it does not charge cards).
- See `docs/deployment.md` for the per-variable reference and `docs/security-fixes.md`
  for the payment-integrity guarantees (SEC-0005/0006) that hold in both modes.
