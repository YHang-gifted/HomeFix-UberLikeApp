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

- **Quote track only**: customer posts a request (category, description, photos, location, preferred
  time) → the **worker** proposes a price quote → the customer **accepts/declines**. Payment is
  gated on an **accepted quote**. There is no customer-side estimate and no negotiation loop beyond
  decline + free-text chat.
- **No fixed-price catalog**, **no AI estimate**, **no assessment visit**, **no on-site variation
  flow**.
- Scheduling is a two-party propose → confirm → reschedule protocol (already built).

---

## 9. Build order

1. **Fixed-price catalog** — add `pricingMode`/`fixedPriceCents`; the catalog UI; the
   fixed-price → auto-accepted-quote convergence (so downstream is untouched). Ship the price-first
   path for a small set of standardized tasks.
2. **On-site scope change (variation)** — needed as soon as fixed pricing exists, or under-priced
   jobs become disputes.
3. **AI estimate** — start as a non-binding range on the quote track; graduate categories into the
   fixed catalog as calibration data earns trust.
4. **Assessment visit + deposit** — depends on the platform-collected deposit mechanism (ties to
   `docs/fee-model.md`).

Pricing (pre-order) and escrow/refunds (post-order) are **different phases** — design them
separately (see `docs/vision-gap.md` for how they sequence together).
