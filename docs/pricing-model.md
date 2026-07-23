# Pricing model — design & decisions

A **design record**, not a shipped spec. It captures how a job gets a price before it can be
matched, why HomeFix needs two pricing tracks, and how to offer both **without** making the app
complex to use. Nothing here changes behaviour until a slice implements it.

Related: `docs/fee-model.md` (how the platform is paid once a price exists), `docs/vision-gap.md`
(original vision vs current state and the roadmap this feeds into).

---

## 1. The problem: the pre-order phase can't be zero

Uber has ~zero pre-order work: it computes a price from measurable inputs (distance × time ×
demand), the driver accepts, and the ride happens. The service is **fungible** — a mile is a mile.

HomeFix is a **dispatch marketplace** where **scope is uncertain and often only discovered on
site**, and jobs are **non-fungible**. So there is an inherent **pre-order assessment phase**:
figure out what the job is, what it's worth, and agree a price. Every mature home-services
marketplace (Thumbtack, TaskRabbit, Angi) uses pro-set quotes or hourly rates for exactly this
reason.

The design goal is therefore **not** to eliminate the assessment phase (impossible) but to make it
**as light as the job allows** — instant for standardized jobs, quoted for the rest.

---

## 2. Two pricing tracks

- **Fixed price (catalog).** For **standardized, well-scoped** tasks — "unclog a drain", "replace
  a standard faucet", "wall-mount a TV" — the platform (optionally AI-assisted) sets **one price**.
  The customer books it directly; a worker accepts it take-it-or-leave-it. This is the Uber-style
  path, and it should grow to cover as many common jobs as the data supports.
- **Quote.** For **custom / uncertain** jobs, the worker prices after seeing the customer's
  description and photos (the current flow), or after an **assessment visit** (§6) when it can't be
  priced remotely.

### 2.1 The fork is a system decision, never a mode the user picks

The customer must **not** be asked "is this simple or complex?" — they will get it wrong and it
adds friction. Instead the fork is decided for them and surfaced as a single flow:

- The **category catalog is the UI**: standardized entries carry a price badge; everything else is
  an "Other / describe your job" entry. What the customer taps determines fixed-vs-quote naturally.
- (Optionally) an AI classifier maps a free-text/photo description to a catalog item when it is
  confident; otherwise it routes to quote.

The customer sees **one** create-request flow. The only downstream difference is what the next
screen shows: a **price + "Book"** (fixed) or **"awaiting quotes"** (quote).

### 2.2 Converge the two tracks early

The trick that keeps both tracks from complicating the whole app: **once a price is agreed,
everything downstream is identical**. So make the fixed-price path produce the **same object** the
quote path does —

> a fixed-price booking **auto-generates an "accepted quote"** at the catalog price.

Then payment, scheduling, escrow, payout, receipt, and refund all see "a job with an accepted
quote and an amount" and **do not branch at all**. The two tracks exist only at the very front of
the flow; the rest of the system is unchanged.

**Data model:** a request carries `pricingMode: 'fixed' | 'quote'` (+ `fixedPriceCents` when
fixed). That is the whole schema delta.

---

## 3. Two matching modes (mirrors the two tracks)

- **Price-first** (catalog/fixed): there is a price up front; workers accept the job at that price.
  This is the Uber model.
- **Pro-first** (custom/quote): match a suitable worker first, who then prices the job. This is the
  native path for uncertain scope.

The app already implements pro-first (post → worker quotes → accept). Price-first is the addition.

---

## 4. AI estimate — advisory, not binding (for the quote track)

For custom jobs, an AI estimate from the photos + category + location can **manage the customer's
expectation** while pros quote — "jobs like this in your area are typically **$X–$Y**". Design
constraints:

- **Non-binding and clearly labelled** as a rough estimate, not a quote. A photo cannot see hidden
  damage, so a binding AI price on open-ended work is risky (workers reject under-priced jobs, or
  take them and cut corners, or re-price on site — the exact disputes to avoid).
- **Wide range, not a single number**, and **region-aware** (labour/material costs vary by area).
- **Calibrated against reality**: compare estimates to the quotes customers actually accept, and
  tighten over time. Only widen the set of jobs the AI is trusted to **fix-price** (catalog) as the
  data earns it.
- **Privacy**: photos may contain people / home interiors / identifiable detail. Sending them to a
  third-party model needs consent and a data-handling policy.

The safe rollout: AI gives a **fixed price only inside the standardized catalog**, and a
**non-binding range** everywhere else.

### 4.1 Keep the estimate qualitative; itemization belongs to the quote

A customer reasonably asks "why this price?", and the temptation is to break the estimate into
**materials / labour-hours / travel**. **Resist that at the estimate stage.** Before anyone has
assessed the job, a line-item breakdown is **fabricated precision**: it manufactures a hard anchor
that the worker's real quote then appears to violate ("the app said 2 hours, why 4?") — the exact
dispute the non-binding framing exists to avoid — and the platform cannot stand behind
per-region material/labour figures pre-assessment.

So the estimate stays a **range plus a one-line qualitative note** on what drives the price (parts,
labour time, site access). The **itemized breakdown belongs to the worker's quote** — the
accountable, binding number, where a real person stands behind each line. A future **"quote line
items"** slice (§9.5) adds materials / labour (hours × rate) / travel to the quote itself. A
_structured_ AI estimate (per-driver ranges) is possible only once the real vision model lands, and
even then stays non-binding.

---

## 5. On-site scope change (variation) — required

Even a well-priced job can discover extra work on arrival. Without a controlled way to handle this,
under-priced jobs either go unmatched or turn into disputes. So the worker can request a **price
adjustment on site**, with **customer approval + photo evidence** of the additional work. This is
"negotiation", but in a **controlled, post-arrival, evidenced** form that is far more defensible
than up-front haggling — and every trades platform has it.

Because of §2.2, a variation is just an adjustment to the agreed amount; the downstream money flow
is unchanged.

---

## 6. Assessment visit — for jobs that can't be priced remotely

Some jobs genuinely can't be priced from photos; the industry answer is a **diagnostic / assessment
visit**: the pro attends, assesses, and quotes on site. This turns "can't price remotely" from a
blocker into a step. If it is **charged**, the fee must be handled to protect against leakage
(私單):

- **Collected by the platform, up front** (the customer pays the platform before the visit), so the
  **first money moves through the platform before the parties meet**, anchoring the relationship
  on-platform, and it also de-risks no-shows.
- **Credited toward the job** if booked — so it's a deposit, not an extra charge; if the customer
  doesn't book, it covers the pro's time.
- **Never cash-in-hand to the pro** — that is building the leakage channel yourself.

> **What was actually built (slices 212–213): the no-deposit shape.** Pre-collecting would require
> **deposit + balance = two payments per request**, a change to the money core, so it was
> deliberately deferred. Instead the visit is a catalog item whose price is a **visit fee**: the
> request is marked `priceProvisional`, which **blocks payment** until the worker prices the job on
> site, and the revision clears it. Since a revision _replaces_ the price, the visit fee is absorbed
> into the final total — the customer pays **once**. The trade-off is no up-front no-show/leakage
> protection; revisit if that becomes a real problem.

See `docs/fee-model.md` §5 for why payment protection (not enforcement) is the real anti-leakage
lever, and how the deposit fits it.

---

## 7. Keeping the UI simple (the whole point)

Complexity is contained by **who** sees it:

- **Customer**: one create-request flow; sees either a price or "awaiting quotes". Never picks a
  pricing mode; never sees fees.
- **Worker**: one job list; a card shows either "Accept $X" or "Submit a quote" (two button states,
  not two screens). The variation and assessment flows reuse existing screens.
- **Backend**: the only real complexity — a `pricingMode` branch **at the front**, and the
  fixed-price → auto-accepted-quote convergence so nothing downstream branches.

The existing `RequestDetailScreen` already renders payment/quote/schedule/refund sections
conditionally by state; a fixed-price block is one more conditional of the same kind — incremental,
not a rewrite.

---

## 8. Current state (what exists today)

**Both tracks are live.** Implemented across slices 206–213:

- **Quote track** (unchanged): customer posts a request → the **worker** proposes a quote → the
  customer accepts/declines. Payment is gated on an accepted quote.
- **Fixed-price track**: `GET /catalog` serves the trusted catalog; booking with `catalogItemId` sets
  `pricingMode: 'fixed'` + `fixedPriceCents`, with the **price and category taken from the catalog**
  (a customer can never set their own fixed price). Taking the job **mints an accepted quote** at
  that price (§2.2), so payment/payout/receipt/refund never branch. The create-request screen leads
  with "Standard jobs — fixed price" and a "Something else" escape to the quote track.
- **On-site scope change**: `POST …/quote/revise` puts the **same** quote back to `pending` at a new
  total with a required reason; the customer agrees via the ordinary accept endpoint. Assigned worker
  only, only once the job is under way, and only while the money has not moved; a pending payment at
  the old price is voided. The worker's form is gated by `quoteView.canRevise`.
- **Assessment visit**: an `assessment` catalog item marks the request **`priceProvisional`**, which
  **blocks payment** until the worker prices it on site; the revision clears the flag. Because a
  revision _replaces_ the price, the visit fee is absorbed into the final total — the customer pays
  once. **No deposit is pre-collected** (decided: the lowest-risk shape, so the money line was
  untouched).
- **AI estimate** (shipped, slices 215–216): a **non-binding range** (low–high) shown on a
  quote-track request before it is priced, hidden once a quote is accepted (the agreed price is the
  source of truth) and never shown on a fixed-price job (the server 404s it). Per-category ranges
  today, behind an **injectable estimator seam** ready for a real model. The estimate stays
  **qualitative** — itemization is deferred to a future "quote line items" slice (§4.1, §9.5).
- Scheduling remains the two-party propose → confirm → reschedule protocol.

**Not built:** a **real vision-model estimator** (today's ranges are per-category defaults behind
the seam) and **quote line items** (§4.1). Catalog prices are **placeholders** pending the
target-job-profile decision (`docs/fee-model.md` §7).

---

## 9. Build order

1. ✅ **Fixed-price catalog** — shipped (slices 206–209).
2. ✅ **On-site scope change (variation)** — shipped (slices 210–211).
3. ✅ **AI estimate** — shipped (slices 215–216) as a non-binding range on the quote track. A real
   vision model and per-category calibration (graduating categories into the fixed catalog as data
   earns trust) remain future work behind the estimator seam.
4. ✅ **Assessment visit** — shipped (slices 212–213) **without** the pre-collected deposit. The
   deposit variant remains possible later, but it needs **deposit + balance = two payments per
   request**, which changes the money core.
5. ⬜ **Quote line items** — itemize the worker's quote (materials / labour hours × rate / travel) so
   the customer sees **why** a price is what it is, at the accountable stage rather than the estimate
   (§4.1). Keeps the estimate qualitative and moves the "explain the price" burden to the binding
   number a real person stands behind.

Pricing (pre-order) and escrow/refunds (post-order) are **different phases** — design them
separately (see `docs/vision-gap.md` for how they sequence together).
