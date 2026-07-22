# Escrow / payout-hold — feasibility & compliance spike

> **STATUS: DEFERRED (2026-07-19).** To reach launch faster **without taking on legal/regulatory
> scope**, escrow is deliberately **not being built** for now, and the post-order roadmap items that
> depend on it (partial refunds, refund window) are deferred with it. The product launches on the
> **existing** model, which needs no new licensing: standard Stripe Connect, where **Stripe** is the
> regulated money transmitter and payouts transfer at settlement (refunds reconcile the payout;
> SEC-0007/0008). Fraud is mitigated by **non-regulatory** means instead — worker vetting
> (certifications), ratings feeding matching, and refund-rate limits. **This file is kept as the
> pre-flight checklist for if/when escrow is revisited.**

A **pre-implementation spike**, not a design to build. Its job is to get to a **go / no-go** on
holding the worker's payout until the customer confirms completion (plus a dispute window), by
laying out (a) the small technical change involved, (b) the **legal questions that must be answered
first**, and (c) the **Stripe questions to confirm**. **No code should be written until the legal
and Stripe items below are cleared.**

> ⚠️ **This is not legal or financial advice.** Holding funds on behalf of others touches
> money-transmission / escrow regulation, which varies by jurisdiction. The questions here must be
> put to a **licensed attorney** and to **Stripe**, and their answers — not this document — decide
> whether and how to proceed.

Related: `docs/vision-gap.md` §5 (why escrow is the anti-fraud keystone), `docs/fee-model.md` §5
(escrow as the anti-leakage moat), `docs/connect-go-live.md`, `docs/pricing-model.md`.

---

## 1. What we want, and why

**Want:** the worker's net is **held after the customer pays** and only **released** to the worker
once the customer **confirms the job is done** (or an auto-confirm timer fires), plus an optional
**dispute window** (e.g. N days). Until release, an in-window refund can always be honoured
automatically.

**Why:** today the payout is transferred to the worker **at settlement**, so a later dissatisfied
customer hits the "already paid out → refund blocked → manual clawback" path (SEC-0007/0008). A hold
turns "pay out first, chase later" into the standard **"hold → confirm/window → release"** model,
which also removes the **negative-balance risk** (refunding after a transfer can push the platform
negative) and is the strongest **anti-leakage** lever (payment protection only applies on-platform).

---

## 2. The technical change is small — that's the point

The platform already uses **Model B: separate charges and transfers** (Stripe Connect):

- The customer's payment settles into the **platform's Stripe balance** (via hosted Checkout /
  off-session PaymentIntent). The funds already **sit in Stripe's custody**, not in a platform bank
  account.
- `payoutService.tryTransferPayout` then calls `stripe.transfers.create` with the worker's connected
  account as the **destination** to move the worker's **net** onward — and today it does this
  **immediately** at settlement.

So **escrow is essentially: do not call `transfers.create` until the release condition is met.** The
money simply stays where it already is (the platform's Stripe balance) for longer. No new custody, no
new money movement, no sweep to a bank account. This is why the change is small **technically** — and
exactly why the **legal** question is the gate, not the engineering.

Rough shape (only after go): a payout stays `pending` (as it can already) until a
`releasePayout(paymentId)` path — driven by a customer completion-confirmation + an auto-release
timer — runs the existing `tryTransferPayout`. Refund-before-release just voids the pending payout
(already how SEC-0007 works). **Nothing here is committed until §4/§5 clear.**

---

## 3. The core legal question

**Does holding a customer's funds and later releasing them to a third-party worker, on a condition,
make the platform a money transmitter / escrow agent that needs a licence?**

The distinction that likely matters most:

- **Funds stay inside Stripe's licensed system** (the platform's Stripe balance, released via Stripe
  transfers) — this is how Connect marketplaces normally operate, and Stripe is the regulated money
  transmitter. Delaying a transfer is a timing change within that system.
- **vs. the platform taking custody in its own bank account** and paying workers out manually — this
  is the pattern that is far more likely to require **money-transmitter licensing (MTL)** in the US
  (state-by-state) and equivalents elsewhere.

**Working hypothesis to confirm (NOT a conclusion):** keep every dollar **inside Stripe's custody**
and **never sweep held funds to a platform-controlled bank account**; then a payout hold is a
delayed Connect transfer, not the platform acting as an escrow agent. **This must be confirmed by
counsel** — "held as escrow pending a condition" can be characterised differently from "not yet
transferred", even when the money sits in the same place, and holding periods, marketing the feature
as "escrow", and dispute-mediation can all change the analysis.

---

## 4. Questions for a licensed attorney (jurisdiction-specific)

- In the **target launch jurisdiction(s)**, does delaying a Connect transfer (funds remaining in
  Stripe's custody) constitute money transmission, escrow, or holding client funds requiring a
  licence, registration, trust account, or bonding?
- Does it change the answer if the platform **mediates disputes** and **decides** when funds
  release (vs. a purely automated timer)?
- Does **calling it "escrow"** (to users, in the ToS) create obligations that "delayed payout" does
  not?
- Are there **maximum hold periods**, disclosure, or consumer-protection rules that apply?
- What must the **user-facing Terms of Service** say about holding, release, refunds, and disputes
  for this to be lawful and enforceable? (ToS is a required deliverable, not just code.)
- Tax/reporting: does a hold change worker income-reporting obligations (e.g. US 1099 timing)?

---

## 5. Questions for Stripe (Connect ToS / capabilities)

- Does Stripe Connect **permit holding funds in the platform balance** for the intended window
  (days) before transferring to a connected account, **as a matter of the Connect Services
  Agreement**? Any caps or conditions?
- Is **separate charges and transfers with a delayed transfer** the recommended pattern for a
  hold-and-release, or should we use **`transfer_data` / `on_behalf_of` / manual payouts / delayed
  capture** instead?
- How do **chargebacks and refunds** behave while funds are held vs. after transfer (this is a key
  argument for holding — confirm it)?
- Any **reserve, balance, or negative-balance** implications of holding larger balances?
- Does Stripe classify the platform differently (e.g. as a payment facilitator or escrow provider)
  if funds are held pending a condition?

---

## 6. Product/design questions that follow a "go" (design later, not now)

- **Release trigger:** customer taps "confirm complete", **and/or** an auto-release timer after
  completion. Both are needed (a customer who ghosts must not trap the worker's money forever).
- **Dispute window length** (e.g. 0/3/7 days) and what a customer can do in it.
- **Worker cash-flow trade-off:** a hold delays the worker getting paid — a satisfaction/retention
  cost to weigh.
- Interaction with **partial refunds** (roadmap item 6) and the **fee-on-refund** policy
  (`docs/fee-model.md` §7).

---

## 7. Go / no-go checklist

Do **not** start implementation until all of these are ✅:

- [ ] Counsel confirms the delayed-transfer (funds-stay-in-Stripe) model does **not** require a
      licence/registration in the launch jurisdiction — or specifies exactly what is required.
- [ ] Stripe confirms holding + delayed transfer is **permitted** under the Connect agreement, and
      the recommended mechanism is chosen.
- [ ] The **release/auto-release policy** and **dispute-window** are decided.
- [ ] **User-facing ToS** for hold/release/refund/dispute is drafted (with counsel).
- [ ] It is confirmed that funds **never leave Stripe's custody** into a platform bank account under
      this design.

Only then does escrow become an engineering task (a modest one, per §2). Until then it stays a
**design/legal item**, and the rest of the post-order roadmap (partial refunds, refund window) — all
of which depend on funds being held — waits behind it.
