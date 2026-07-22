# Vision vs current — gap analysis & roadmap

A **design record**: how the app's current flow compares to the original product vision, what's
missing, how feasible the missing pieces are (and their risks), and a **dependency-ordered
roadmap**. Nothing here changes behaviour.

Related: `docs/pricing-model.md` (the two-track pricing design), `docs/fee-model.md` (how the
platform is paid), `docs/PROJECT-STATUS.md` (what's built), `docs/go-live-checklist.md` (launch
gates).

---

## 1. The original vision (as described)

1. Customer takes **photos**.
2. A **built-in AI** gives an estimated price from the photos, so the customer has a rough
   expectation.
3. Customer sends the job out **with their own estimate** attached.
4. The **worker** sees the customer's estimate, checks whether there's a gap, and **accepts or
   re-quotes**.
5. If the gap exceeds a threshold, **the two sides negotiate** a final price.
6. Both **accept the price + appointment time**.
7. Worker **departs, works, completes**.
8. Customer **confirms completion, then pays**.
9. Worker **confirms receipt**.
10. Customer can request a **partial or full refund within a time window**.
11. **Guard against malicious refunds / poor workmanship exploiting** the "customer is refunded but
    the worker still keeps part of the payout" loophole.

---

## 2. Step-by-step: vision vs current

| #   | Vision                              | Current                                                                   | Status                         |
| --- | ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------ |
| 1   | Customer photos                     | Photo upload built (migration 0006)                                       | ✅ built                       |
| 2   | AI price estimate                   | none                                                                      | ❌ missing                     |
| 3   | Customer attaches own estimate      | request has no customer price; the **worker** quotes                      | ❌ different (reversed)        |
| 4   | Worker checks gap, accept/re-quote  | worker proposes once; customer accepts/declines                           | ⚠️ different (one-directional) |
| 5   | Threshold negotiation               | none (only free-text chat)                                                | ❌ missing                     |
| 6   | Accept price + time                 | quote acceptance + two-party scheduling                                   | ✅ built                       |
| 7   | Depart → work → complete            | status machine matched→accepted→in_progress→completed                     | ✅ built                       |
| 8   | Confirm completion, then pay        | payment is gated on an **accepted quote**, not on completion confirmation | ⚠️ order differs               |
| 9   | Worker confirms receipt             | settlement is automatic via webhook; worker is notified                   | ⚠️ automatic, no manual step   |
| 10  | Partial/full refund within a window | full refund only, no time window, admin-mediated (slices 199–202)         | ⚠️ partial                     |
| 11  | Anti-fraud on refund/payout         | integrity guard exists (SEC-0007/0008); no escrow hold                    | ⚠️ partial                     |

**The core transaction rails (post → match → quote → accept → schedule → work → complete → pay →
payout → refund request) are built and solid.** The gaps are the pieces that most define the
original vision: AI pricing, the two-sided quote/negotiation, completion-gated escrow, and
partial/time-boxed refunds.

---

## 3. The biggest gaps (grouped)

- **AI photo estimate** (step 2) — still not built; the last open pre-order item.
- ~~**Two-sided quote / threshold negotiation** (steps 3–5)~~ — **resolved differently, and shipped
  (206–213).** Instead of up-front haggling, the platform prices standardized jobs from a **catalog**
  and everything uncertain is settled by an **on-site revision** (or an **assessment visit** when it
  can't be priced remotely). This gives the customer the price certainty the vision wanted, without a
  negotiation state machine — see `docs/pricing-model.md` §2, §5, §6.
- **Completion-confirmation gate + escrow** (steps 8, 11) — payment is quote-gated, not
  completion-gated, and the payout is scheduled at settlement with **no hold-until-confirmation**.
  This is the root of the anti-fraud concern (§5).
- **Partial + time-boxed refunds** (step 10) — only full, no window.

---

## 4. Feasibility & risks of the missing pieces

- **AI estimate — tech easy, accuracy hard.** Integrating a vision model is trivial; making the
  number _useful_ is not (photos hide scope; pricing is regional). Risk: a wrong estimate the
  customer anchors on creates more disputes than it prevents. Also per-image cost and photo
  **privacy** (consent + data handling). → Ship as a **non-binding range**, fixed-price only inside
  a standardized catalog, calibrated against accepted quotes. (`docs/pricing-model.md` §4.)
- **Two-sided negotiation — tech medium, product risk high.** A full offer/counter-offer loop is a
  state machine, but most successful marketplaces **avoid free haggling** because it slows
  conversion and feels like a flea market. → Prefer platform/neutral pricing for standardized jobs
  - controlled **on-site variation**, not up-front negotiation. (`docs/pricing-model.md` §2, §5.)
- **Escrow / hold-until-confirmation — tech medium, legal/compliance HIGH.** Technically Stripe
  Connect supports delaying the transfer until a release condition — the current
  charge-then-transfer model just needs the transfer **held** until completion + a dispute window.
  **But holding funds on behalf of others can implicate money-transmission / escrow licensing.**
  The practical guardrail: keep funds **inside Stripe's custody** (use Stripe's hold/transfer
  timing) and **never take the money into a platform bank account to pay out manually**; confirm the
  hold pattern is within Connect's ToS. **This is the one item to get legal advice on before
  building.** (Not legal advice here — flagging the risk.)
- **Partial / time-boxed refunds — tech medium, policy hard.** Stripe supports partial refunds; the
  hard parts are **policy**: proportional payout reconciliation, whether the platform keeps its
  commission on a refund (see `docs/fee-model.md` §7), and the window's **start point** (must be
  **customer confirmation**, not worker-marked completion, or a worker can start the clock early).
  Partial refunds **without** escrow just widen the clawback problem — so escrow comes first.

---

## 5. The anti-fraud concern, precisely

**What exists (SEC-0007/0008):** on refund, the payout is reconciled — a still-**pending** payout is
reversed (customer refunded and worker paid can never both happen); an **already-paid-out** payout
**blocks** the admin refund (409 → manual clawback). So the "customer refunded but worker keeps
part" state is prevented at the integrity level.

**The gap:** the payout releases at **payment settlement**, not gated on **completion confirmation
or a dispute window**. So a worker can be paid out quickly; if the customer is then unsatisfied, the
refund is blocked and falls to painful manual clawback. The clean fix is an **escrow / hold
window**:

1. **Completion-confirmation gate** — the customer confirms completion (or an auto-confirm timer
   fires) to start the release.
2. **Payout hold window** — funds stay with the platform (via Stripe) until confirmation **+** a
   dispute window (e.g. N days), so in-window refunds are always honoured automatically, never
   clawed back.
3. **Partial refunds** — proportional customer refund + proportional payout reconciliation.
4. **Refund time window** — "within N days of **confirmed** completion".
5. **Two-sided abuse guards** — cap serial/abusive customer refunds; use worker rating / refund-rate
   thresholds (ties into "ratings feed matching").

This upgrades the model from "pay out first, chase later" to the standard **"hold → confirm/window →
release"** escrow marketplace model, which is exactly steps 8, 10, and 11 of the vision.

---

## 6. Dependency-ordered roadmap

Pricing (**pre-order**) and escrow/refunds (**post-order**) are different phases; each is internally
ordered. **Escrow is the keystone** — the refund enhancements depend on funds being held.

**Pre-order (pricing) — see `docs/pricing-model.md`. This line is now COMPLETE except AI.**

1. ✅ **Fixed-price catalog — shipped (slices 206–209).** A server-side catalog is the trusted price
   source (`GET /catalog`); booking by `catalogItemId` sets `pricingMode: 'fixed'` +
   `fixedPriceCents` with the price **and category** taken from the catalog; taking the job mints an
   **accepted quote** at that price, so payment/payout/receipt/refund need no branching; the customer
   booking UI leads with "Standard jobs — fixed price".
2. ✅ **On-site scope change — shipped (slices 210–211).** Modelled as a **revision of the same
   quote** (back to `pending` at the new total with a required reason) rather than a new entity, so
   the customer agrees through the ordinary accept endpoint and nothing downstream changes. Guarded
   to the assigned worker, only once the job is under way, and only while the money has not moved; a
   pending payment at the old price is voided. Worker UI gated by `quoteView.canRevise`.
3. ⬜ **AI estimate — the only pre-order item left.** Non-binding range on the quote track;
   categories graduate into the fixed catalog as calibration data earns it. Tech is easy, accuracy is
   the risk (§4).
4. ✅ **Assessment visit — shipped (slices 212–213), deliberately WITHOUT an up-front deposit.**
   Decision: the lowest-risk shape — no deposit is collected, so the money line was untouched. An
   `assessment` catalog item marks the request **`priceProvisional`**, which **blocks payment** until
   the worker prices it on site; the revision then clears the flag. Because a revision _replaces_ the
   price, the visit fee is absorbed into the final total — the customer pays once.
   _The deposit variant (pre-collected + credited) remains available later, but it needs
   **deposit + balance = two payments per request**, which is a change to the money core._

**Post-order (money protection):**

5. **Escrow / payout hold + completion-confirmation gate** — ⏸️ **DEFERRED to avoid legal/regulatory
   scope and launch faster** (2026-07-19; see `docs/escrow-spike.md`). It is the anti-fraud keystone
   and the anti-leakage moat (`docs/fee-model.md` §5), but it is the one item that could implicate
   money-transmission/escrow licensing, so it is parked until the legal/Stripe answers are worth
   getting. The product ships on the existing "transfer at settlement + refund reconciliation
   (SEC-0007/0008)" model, which needs no new licensing.
6. ⏸️ Partial refunds + proportional payout reconciliation — **deferred with escrow** (without a hold
   it just widens the clawback problem).
7. ⏸️ Refund time window — **deferred with escrow**.
8. Fee-model evolution — tiered commission + (later) subscription (`docs/fee-model.md`). Independent
   of escrow; can proceed whenever the job-profile numbers are decided.
9. **Ratings feed matching + refund-rate guards** — the **non-regulatory** substitute for escrow's
   fraud protection: keep bad workers out and cap serial refunds, no fund-holding. Can proceed now.

**Where this leaves us:** the pre-order (pricing) line is done bar the AI estimate. Escrow and the
refund enhancements are **deferred to keep launch clear of regulatory scope**, so the next work is
**the go-live checklist** (`docs/go-live-checklist.md` — all config/ops/proof, no legal), with the
cheap fraud mitigations (9) and the AI estimate available as product follow-ups.

---

## 7. Open questions that steer everything

- **Target job profile** — high-frequency/low-value vs low-frequency/high-value? Drives pricing
  track emphasis, fee model, and leakage pressure (`docs/fee-model.md` §7). **Still open**, and it
  also decides which catalog tasks and prices are real (today's catalog prices are placeholders).
- ~~**Assessment visit** — charged or free?~~ **Decided:** charged as a catalog visit fee, but **not
  pre-collected** — the fee is absorbed into the on-site total, so the customer pays once
  (slices 212–213). Revisit only if no-shows or leakage become a real problem.
- **AI estimate placement** — up front for expectation, or only behind the catalog? (§4.) Still open;
  the last pre-order item.
- **Escrow** — legal viability in the target market + Stripe Connect ToS confirmation (§4, §5).
  **Still open, and now the gating question for the whole post-order line.**
