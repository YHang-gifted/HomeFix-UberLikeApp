# Fee model — design & decisions

This is a **design record**, not a shipped spec. It captures the reasoning behind how HomeFix
charges for a completed job, what exists today, what is proposed, and — deliberately — which
numbers are still **business decisions to be made**, not engineering ones. Nothing here changes
behaviour until a slice implements it.

Related: `docs/PROJECT-STATUS.md` (what's built), `docs/go-live-checklist.md` (launch gates), and
the escrow / refund discussion behind the payment-protection lever below.

---

## 1. Why this is not the Uber pricing problem

Uber prices a **fungible, measurable, instant** service: a ride is a ride, priced by distance ×
time × demand, and the driver just accepts and drives. The pre-order phase is ~zero.

HomeFix is a **dispatch marketplace**: scope is **uncertain and discovered on-site**, jobs are
**non-fungible**, and there is an inherent **pre-order assessment phase** (figure out the job,
price it, agree). That phase can be made lighter (a standardized fixed-price catalog for simple
tasks) but not removed (custom jobs need a quote or an assessment visit). See
`docs/pricing-model.md` if/when written.

The fee model must respect this: the platform earns on a **completed job**, and the burden of the
fee is heaviest exactly when scope was largest and most uncertain.

---

## 2. Principles (what "fair to three parties" means here)

The three parties are the **customer**, the **worker/pro**, and the **platform**. A fee model is
"fair" to the extent that:

1. **Nobody pays for value they did not receive.** The customer pays for a completed service; the
   worker pays only out of money actually earned; the platform is paid for the match it actually
   delivered. (This is the core reason a per-job commission is the principled default — lead-fee
   and subscription models both create a party who "pays for nothing" in some cases.)
2. **Incentives are aligned.** The platform makes money only when both sides transact, so it is
   motivated to deliver good matches, not just volume.
3. **Cost is predictable enough** for a pro to plan around.
4. **Leakage (off-platform / 私單) is not over-incentivised.** Home-repair jobs are trivially easy
   to take off-platform after the parties meet, so a fee model that makes dodging very lucrative
   will simply be dodged. The rate and the payment-protection moat (§5) matter more here than in a
   ride-hailing app.

No single model wins on every axis; the design below is the most balanced for these four.

---

## 3. The model — v1: transparent, tiered per-job commission

**Keep the per-job commission** (this is what exists today — see §8), but evolve its shape:

- **Split transparently between customer and worker.** Rather than one side silently bearing the
  whole fee, the worker pays a commission on their net and the customer pays a small, visible
  service fee. Sharing the burden — and showing it — reduces the "I'll just dodge this" resentment
  each side feels when it carries the full weight alone.
- **Tiered / regressive by job size.** A higher rate on small jobs (their fixed costs — payment
  processing, support, matching — are a large fraction of a small amount) and a lower rate on large
  jobs (a flat high % on a big job over-charges and drives leakage). This is the auction-house
  pattern (higher fee on cheap lots, ~10% on expensive ones).
- **Minimum fee (a floor).** On a very small job even a high % may not cover the per-transaction
  cost, so a fixed minimum applies (e.g. a $20 task).
- **Cap / taper on large jobs.** Above a threshold the marginal rate drops (or an absolute cap
  applies), so the fee on a large job never becomes a big enough number to be worth dodging.

### 3.1 Avoid the threshold "cliff" — use marginal brackets

The one trap in tiered pricing: a **hard cliff** ("< $1000 → 35%, ≥ $1000 → 10%") makes a $999 job
and a $1001 job pay wildly different fees, so people **game the threshold** (inflate, split, or
merge jobs to cross it). Do **not** do hard cliffs.

Instead, make the tiers **marginal, like income-tax brackets**: the higher rate applies only to the
**portion of the amount within the lower band**, and the lower rate to the **portion above**. The
fee is then a continuous function of the amount — no cliff, nothing to game.

### 3.2 Worked example (illustrative numbers — NOT decided)

> These figures are placeholders to show the shape. The real rates, thresholds, split ratio, and
> minimum are **business decisions** (see §7).

Suppose: minimum fee **$3**; **20%** on the portion up to **$500**; **10%** on the portion above
**$500**; worker pays commission, customer pays a small flat service fee separately.

- **$80 job** → 20% × 80 = $16 (above the $3 floor) → platform $16, worker keeps $64.
- **$500 job** → 20% × 500 = $100.
- **$1,500 job** → 20% × 500 + 10% × 1,000 = $100 + $100 = **$200** (an effective ~13%, not 20%),
  so a large job is not punished and the absolute fee stays modest enough to keep on-platform.

The point is the **shape** (regressive, continuous, floored), not these specific numbers.

---

## 4. Future: a subscription option, volume-gated, pro-chosen

A flat monthly subscription (little/no per-job cut) is **great for high-volume pros** (marginal
jobs are ~free, cost is predictable, near-zero leak incentive) and **bad for new/low-volume pros**
(a fixed cost against little work). So do not force it on everyone — **offer both and let the pro
choose, but only unlock the choice after a volume threshold**:

- **New / low-volume pros** stay on **commission** by default — pay only when they earn, zero
  upfront risk.
- **Pros with enough completed jobs** unlock a **subscription** option they can opt into (predictable
  cost, cheaper at their volume).

This gives every pro a fair deal **for their stage**, which is arguably fairer than any single model.
It is what mature platforms (Angi, Thumbtack) converge on.

**Do not build this in v1.** It solves a problem you only have once there is real supply-side scale,
and it needs accumulated per-pro volume data to gate on — neither exists pre-launch. It is a clean,
self-contained **later** slice.

---

## 5. Anti-leakage: the fee model leans on payment protection, not enforcement

Off-platform leakage is the existential problem of every service marketplace and **cannot be
prevented, only reduced**. The strongest lever is **not** policing pros — it is giving the
**customer** (who holds the money and the leverage) a reason to insist on booking through the
platform:

- **Payment protection / escrow, refund guarantee, and dispute resolution — valid only for
  platform-booked jobs.** If the customer insists on paying through the platform to stay protected,
  the pro cannot leak without losing the customer. This same escrow machinery is what protects
  against malicious refunds and worker-side abuse, so the anti-fraud and anti-leakage goals
  **reinforce each other**.
- **Keep the take-rate moderate and capped** (§3): the higher the fee, the stronger the dodge
  incentive, and home-repair jobs are easy to dodge.
- **Assessment/booking deposit collected by the platform, credited to the job** (see
  `docs/pricing-model.md`): the first money moves **through the platform before the parties meet**,
  anchoring the relationship on-platform. Never let the first payment be cash-in-hand to the pro.
- Secondary friction (masked contact details, in-app chat, ToS prohibition + detection of
  off-platform solicitation) are **speed bumps, not walls** — useful, but not the main defence.

---

## 6. Architecture — keep the whole thing behind one function

The models above must **not** leak complexity into the app. The rule:

- **The customer never sees any of it.** Commission, split, tiers, subscription — all live on the
  **pro/platform side**. The customer sees a price. Full stop. No fee logic in customer-facing UI.
- **The pro sees, at most, one account-level opt-in** ("You've done N jobs — a $X/mo plan would have
  saved you $Y. Switch?") once eligible. Never a per-job choice.
- **All fee calculation lives in one place** — a single `computePlatformFee(pro, job)` (evolving
  today's `splitPaymentAmount`) that, given the pro's current plan and the job amount, returns the
  split. Tiered brackets, the minimum, the cap, and commission-vs-subscription are all **branches
  inside that one function**; every caller (payment, payout, receipt, refund) just calls it and is
  unaffected. This mirrors the "converge early / isolate the branch" principle used elsewhere.

Isolating it this way is what keeps a richer fee model from becoming per-transaction complexity.

---

## 7. Open decisions (business, not engineering)

These must be chosen before implementing §3 — they are **not** technical questions:

- The **target job profile** (high-frequency/low-value like drain-clearing and furniture assembly,
  vs low-frequency/high-value like renovations) — this drives everything, including whether pure
  commission is even viable (big-ticket, low-frequency jobs leak harder and may push toward
  subscription/lead-fee sooner).
- The **commission rate(s)**, **bracket threshold(s)**, **minimum fee**, and **cap**.
- The **customer-side service fee** (if any) and how the split is presented.
- The **subscription price** and the **volume threshold** that unlocks it (future).
- Whether the assessment/booking deposit is charged, and how much (see `docs/pricing-model.md`).
- Fee treatment on **refunds** (does the platform keep its commission on a refunded/partially
  refunded job?) — ties into the refund/escrow work.

---

## 8. Current state (what exists today)

- The platform already takes a **single flat commission** on each payment.
  `splitPaymentAmount(amountCents, PLATFORM_FEE_BPS)` splits a payment into `platformFeeCents` +
  `workerNetCents`, stored on the payment and shown on the receipt. This is **Model B** — the
  platform takes the customer's payment and transfers the worker's **net** over Stripe Connect.
- There is **no** tiering, minimum, cap, customer-side service fee, or subscription yet.
- Refunds currently reverse the **full** payment (and reconcile the payout, SEC-0007/0008); there is
  no partial/proportional refund, which the fee-on-refund decision in §7 interacts with.

**Build order:** evolve `splitPaymentAmount` → `computePlatformFee` with **brackets + minimum +
cap** first (v1, once the §7 numbers are chosen); add the **subscription option** as a later,
self-contained slice when there are high-volume pros and the data to gate on.
