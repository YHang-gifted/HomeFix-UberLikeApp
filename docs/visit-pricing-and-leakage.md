# Site-visit pricing, no-show protection & platform leakage — design record

A **design record**, not a shipped spec. It captures a discussion about how to price the
**assessment / site visit**, how to protect a worker against a wasted trip, and the platform's
stance on **leakage (私單 — parties going off-platform to avoid the commission)**. Nothing here
changes behaviour until a slice implements it.

Related: `docs/pricing-model.md` (§6 assessment visit — the shipped flat-fee shape),
`docs/fee-model.md` (how the platform is paid), `docs/vision-gap.md` (roadmap this feeds into).

---

## 1. Starting point: the flat visit fee is a blunt tool

What is shipped today (`pricing-model.md` §6, slices 212–213): the assessment visit is a single
catalog item at a **flat $49**, marked `priceProvisional`, credited toward the final total when the
worker prices the job on site (no separate deposit — the customer pays once).

The flat fee ignores the one thing it is actually meant to compensate: **the worker's cost of
travelling to a job that may not convert.** A visit fee that is the same whether the worker is 5
minutes away or an hour away is charging the wrong thing.

## 2. What the visit fee is really compensating

The fee exists to cover the **worker's downside on a wasted trip**. That downside is a function of
three variables, not just distance:

- **Travel cost** — time + fuel to get there and back.
- **Conversion probability** — how likely the visit turns into a paid job.
- **Job value** — how big the eventual job is.

The real decision rule is **travel cost _relative to_ the expected value of the job**, not distance
alone:

- **Close + large job** → a worker will happily visit for free; the free look is customer-acquisition
  cost, and the job dwarfs the trip.
- **Far + small job** → the trip is a large fraction of the reward; a fee is reasonable, and the
  customer will pay it more willingly _because_ the worker clearly travelled for them.

**Field analogy (where this intuition comes from):** oilfield contractors will drive an hour+ to do
a **free** on-site assessment and then quote, because the job value makes the trip worth it. Home
services are lower-value, so the same free-far-trip does not always pencil out — which is exactly
why the fee should scale with the burden, not be flat.

## 3. Models for the visit fee

- **(A) Distance-tiered.** Free (or waived) within a radius (e.g. under X miles / Y minutes); a fee
  beyond, scaling with distance. Closest to the intuition. **Prerequisite:** the platform must know
  the worker's location (a home/base coordinate or live location) to compute distance — data the app
  does not have today.
- **(B) Worker-set / optional.** The worker decides, per job, whether to charge a visit fee and how
  much — they alone know their travel and how much they want the work. Competitive workers waive it
  to win the bid; distant or busy ones charge. **Closest to the real market / the oilfield reality**;
  needs no worker-location data. Downside: less predictable for the customer.
- **(C) Matching-driven.** Match the customer's **nearby** certified workers first; a nearby worker
  means a naturally cheap/free visit, and a fee only comes into play when nobody local is available
  and someone must travel far. Ties the fee to **supply density** and rewards local matching.
- **(D) Flat fee (current).** Simplest, but the blunt tool §1 describes.

**Leaning: (B) + (C).** Match local workers first, and let the worker decide whether the visit is
free or carries a fee, inside a platform frame ("this is a $X visit fee, credited toward the total").
The platform does not hard-set a number. (A) sounds scientific but is blocked on worker-location data
and, more fundamentally, distance ≠ willingness — the worker's own call is a better signal. An
optional **platform-suggested floor** could sit under (B) if we want a guardrail.

## 4. No-show protection: a cancellation penalty, not an upfront tax

One job the flat visit fee quietly did was **filter out customers who waste a worker's trip**. There
is a better tool for that, borrowed from Uber: a **two-sided cancellation / no-show penalty** with a
**grace window**.

- Free to cancel within a short window after commitment; past it, a fee applies, part of which
  compensates the worker who already set out.
- **Two-sided:** a worker who no-shows on the customer is penalised too.
- The point: **only the party who actually flakes pays** — honest customers face zero upfront
  friction, which lifts booking conversion while still protecting the worker.

**Prerequisites (do not underestimate these):**

1. **A card on file + consent to be charged after the fact.** Uber can auto-charge because it holds
   your card. Saved cards already shipped (slices 193–198), so the mechanism exists — but it needs an
   explicit "you agree to a $X fee if you cancel late / no-show" consent.
2. **The hard part is adjudication, not the charge.** "I cancelled because the worker was two hours
   late" must be resolvable. This needs an **arrival / check-in signal + a grace window + a
   who-cancelled-first-and-was-it-justified rule** — the real engineering cost, well above the fee
   itself. Uber leans on GPS and timestamps for this.
3. **Dispute handling** for contested cancellations.

**What it does and doesn't solve:** it addresses **no-shows**. It does **not** address **leakage** —
on an honest booking, no money moves until the job, so the parties still meet with nothing having
flowed through the platform yet. Leakage is §5.

## 5. Leakage (私單): manage it, don't try to seal it

**Leakage is unavoidable — even Uber has it.** Airport touts offer private rides precisely to escape
the platform's cut. The goal is never zero leakage; it is making the **platform's value exceed the
commission the parties would save by going off-platform.**

The proof is rider behaviour: most riders refuse the tout and stay with Uber for **safety, trust, and
recourse** — they would rather pay the cut than lose those. HomeFix's anti-leakage strategy is the
same: **be worth more than the saved commission.**

Consequences for design:

- **Do not over-tax to prevent leakage.** Mandatory visit fees, deposits, and escrow all add friction,
  and too much friction **pushes people to leak**. The low-friction path (optional visit fee + a
  penalty only on flaking) likely reduces leakage better than a heavy upfront tax. The more the
  platform grabs, the stronger the incentive to go around it.
- **The real anti-leakage moat is on-platform value, not fees:** certified/verified workers, reviews,
  refund/dispute resolution (the refund-appeal flow just shipped), payment protection, scheduling,
  saved cards, and warranties. These are what make a customer choose the platform the way a rider
  chooses Uber at the airport.

### 5.1 Repeat relationships are the home-services battleground (unlike Uber)

Uber rides are mostly **one-off**, so leakage per ride is limited. Home services are not: **once a
worker does a good job, the customer has their number and can call them directly next time — no app,
no cut.** This recurring-relationship leakage is the biggest and most HomeFix-specific risk, and it
does not exist in the Uber model.

- The **"favourite worker" feature is a double-edged sword**: it helps on-platform re-booking, but it
  also cements the direct relationship the customer could take off-platform.
- **Countermeasure — make on-platform re-booking better than a phone call, not a cage:** one-tap
  re-book the same worker, platform-only warranty / payment protection on re-booked jobs, loyalty or
  a frequent-customer subscription. Bind **convenience + protection** to on-platform re-booking rather
  than trying to trap the relationship.

### 5.2 Moderate commission is part of the anti-leakage design

Low cut + high platform value → little leakage. A greedy cut → the leakage incentive spikes. This is
why the fee model is deliberately **moderate** (tiered commission, a cap so large jobs are not
over-taxed, a future volume-gated subscription — see `docs/fee-model.md`).

## 6. A coherent target model

- **Visit fee:** worker-set, usually free — especially for a nearby, local match (§3 B + C).
- **No-show protection:** a **two-sided cancellation / no-show penalty** with a grace window, charged
  after the fact via a saved card (§4) — not a mandatory upfront fee.
- **Leakage / quality:** handled by **on-platform value + a moderate commission** (§5), not by
  taxing the visit; with re-booking made frictionless and more valuable than going direct (§5.1).

This is more Uber-like and lower-friction than the current flat fee, and it matches the observed
reality that people stay on a platform for value, not because they are trapped.

## 7. Open prerequisites (what would have to exist first)

- **Worker location / service area** data — needed for (A) distance-tiering and (C) local matching.
  Not in the app today; (B) worker-set does not need it, which is another reason it leans first.
- **An arrival / check-in signal + grace window** — the backbone of any cancellation-penalty
  adjudication (§4). This is the substantive build, not the fee.
- **Explicit consent to post-hoc charging** for the cancellation penalty (§4).
- **One-tap re-book + on-platform-only protections** to counter repeat-relationship leakage (§5.1).

## 8. Status

Nothing here is built. The shipped state remains the flat, no-deposit visit fee (`pricing-model.md`
§6). This record is the blueprint for evolving it; sequence and scope to be decided when a slice is
scheduled. Pricing (pre-order) and no-show/cancellation (post-commitment) are **different phases** —
design and ship them separately.
