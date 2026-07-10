# PayPal Go-Live Runbook

Taking real payments through **PayPal** (which also offers **Venmo** as a funding option
in the US), alongside Stripe. The code is ready; this is an **operator procedure** — you
supply the credentials and run the sandbox test. Nothing here is exercised in CI.

> Secrets are operator-supplied and never committed. Set them as service variables on the
> deploy platform (e.g. Railway), not in the repo. Do a full **sandbox** dry run before
> switching to live credentials.

## How the flow works (what the credentials switch on)

- With **no** `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`, PayPal is **unavailable**: the app
  hides the method picker (unless `EXPO_PUBLIC_PAYPAL_ENABLED` is set) and a `method: 'paypal'`
  payment is rejected with **400**. Card/mock payments are unaffected.
- With the credentials set (and `PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL`), choosing PayPal
  opens a PayPal **Order** (intent `CAPTURE`, our `paymentId` on the order as `custom_id`)
  and the app redirects the customer to PayPal's approval page.
- **Settlement is a two-step flow (unlike Stripe's auto-settling Checkout):** after the
  customer approves and is returned to `PAYPAL_RETURN_URL`, the app's **"Complete PayPal
  payment"** action calls `POST /service-requests/:id/payment/paypal/capture`, which captures
  the order server-side and settles the payment **only on a `COMPLETED` capture** — so a
  payment is never marked paid without PayPal actually charging the buyer. The worker's net
  is then scheduled for payout (mock Model-B).
- The mock `/pay` path is disabled (**409**) for any PayPal payment, so it can't be marked
  paid "for free".

> **Known limitation (until the webhook backup lands):** settlement currently relies on the
> customer returning and completing capture. If they approve but never return, the order is
> approved-but-uncaptured and the payment stays `pending`. A `/webhooks/paypal` backup
> (`PAYMENT.CAPTURE.COMPLETED` / server-side capture on `CHECKOUT.ORDER.APPROVED`) is the
> planned hardening — do a small-scale rollout first.

## Required configuration

**Server** (Railway service variables):

| Variable               | Value                                | Notes                                                                     |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `PAYPAL_CLIENT_ID`     | sandbox then live REST **Client ID** | Turns PayPal on.                                                          |
| `PAYPAL_CLIENT_SECRET` | the app's **Secret**                 | Operator-supplied; never committed.                                       |
| `PAYPAL_RETURN_URL`    | app URL + `?payment=success`         | **Required** when the client id is set (the server fails fast otherwise). |
| `PAYPAL_CANCEL_URL`    | app URL + `?payment=cancelled`       | Required (as above).                                                      |
| `PAYPAL_ENV`           | `sandbox` (default) or `live`        | Chooses `api-m.sandbox.paypal.com` vs `api-m.paypal.com`.                 |

**Web app** (Docker build arg, inlined at build time):

| Variable                     | Value  | Notes                                                                                                                |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_PAYPAL_ENABLED` | `true` | Shows the Card/PayPal method picker. Changing it needs a rebuild. Set it only once the server has PayPal configured. |

## Procedure

### 1. Create a PayPal REST app (sandbox)

1. Go to the PayPal Developer dashboard → **Apps & Credentials** → **Sandbox**.
2. **Create App** (a REST/merchant app). Copy its **Client ID** and **Secret**.
3. (Optional, US) enable **Venmo** for the app / business account so Venmo shows as a
   funding option in checkout — no code change needed; eligibility is PayPal-side.

### 2. Set the variables (sandbox) and redeploy

Set on the deploy platform, then redeploy so the server picks them up:

```
PAYPAL_CLIENT_ID=<sandbox client id>
PAYPAL_CLIENT_SECRET=<sandbox secret>
PAYPAL_RETURN_URL=https://<your-host>/?payment=success
PAYPAL_CANCEL_URL=https://<your-host>/?payment=cancelled
PAYPAL_ENV=sandbox
```

Rebuild the web bundle with the picker enabled (Railway: add the variable; it is declared
as a Docker `ARG`, so it reaches the build):

```
EXPO_PUBLIC_PAYPAL_ENABLED=true
```

On boot, confirm the server started (a client id without the return URLs fails fast) and
that `GET /ready` is 200.

### 3. Sandbox dry run (do this before live)

1. As a customer, drive a request to an **accepted quote**, then open Payment.
2. Choose **PayPal** in the method picker, enter the amount, **Set up payment**.
3. Tap **Pay with PayPal** — you should be redirected to PayPal's **sandbox** approval page.
   Log in with a **sandbox buyer** account (create one under Sandbox → Accounts) and approve.
4. Back in the app, tap **Complete PayPal payment**. The payment should flip to **Paid** —
   this proves the server captured the order (a payment can't be paid without a COMPLETED
   capture).
5. Confirm a **pending payout** was scheduled for the worker (worker's Payouts screen).
6. Negative check: a direct `POST …/payment/pay` on the PayPal payment returns **409**.

### 4. Go live

1. Only after the sandbox dry run passes end-to-end: create a **Live** app in the dashboard
   and copy its **live** Client ID + Secret.
2. Update `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` to the live values and set
   `PAYPAL_ENV=live`; keep the return URLs. Redeploy.
3. Do one **small real** transaction end-to-end and confirm settlement + payout.

### Rollback / kill switch

To stop offering PayPal immediately, **unset `PAYPAL_CLIENT_ID`** (or set it empty) and
redeploy: PayPal becomes unavailable (a `paypal` payment attempt returns 400) and nothing is
charged. To also hide the picker, rebuild with `EXPO_PUBLIC_PAYPAL_ENABLED` unset.

## Guardrails

- Never commit any PayPal client id/secret; keep them in platform variables only.
- Do not set live credentials until the sandbox loop passes.
- The provider seam is config-gated and mock-by-default, so an accidental removed credential
  is safe (PayPal simply becomes unavailable; it does not charge).
- **Currency:** PayPal charges in the payment's currency. Verify your PayPal account supports
  it and confirm the zero-decimal handling (e.g. TWD/JPY) before live use.
- See `docs/deployment.md` for the per-variable reference and `docs/stripe-go-live.md` for the
  parallel Stripe procedure; both providers coexist and the customer chooses at checkout.
