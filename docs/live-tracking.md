# Live worker-location tracking (appointment "on the way") — design record

A **design record**, not a shipped spec. It captures the vision for tracking a worker's location on
the way to a **scheduled** job, the real-time "your worker is on the way" notifications around it,
and — importantly — why this one feature is the **enabler** for several things other records leave
"blocked on data we don't have yet." Nothing here changes behaviour until a slice implements it.

Related: `docs/visit-pricing-and-leakage.md` (this unblocks its open prerequisites),
`docs/pricing-model.md`, `docs/fee-model.md`, `docs/vision-gap.md`.

---

## 1. The vision, and how it differs from Uber

Uber dispatches in real time: request and accept are effectively instantaneous. HomeFix is
**appointment-based** — a visit is proposed and confirmed, and the worker sets out for _that_ booking
on the agreed day. The adaptation of Uber's "your driver is on the way" is therefore:

> Once a worker leaves for a specific, already-scheduled job, the customer can see that the worker has
> **departed**, roughly **how long** until arrival, and (optionally) the worker's **live location** on
> the way — so nobody is left wondering "is my worker actually coming?"

Crucially, this is **not** always-on tracking of the worker. It is **scoped to one job's travel
window**: sharing begins when the worker starts heading to the appointment and ends at arrival — the
same per-trip model Uber uses, which keeps it privacy-respecting.

## 2. Why it matters: one feature, three payoffs

This is not just a nice-to-have. It is the **missing data source** that several other design records
flag as "not in the app today":

1. **Distance-based visit pricing + local matching** (`visit-pricing-and-leakage.md` §3 A/C) need the
   worker's location. Live tracking (and/or a worker home/base coordinate) provides it.
2. **Cancellation / no-show penalty adjudication** (`visit-pricing-and-leakage.md` §4) needs an
   **arrival / departure signal**. The "on my way" and "arrived" timestamps _are_ that backbone —
   they let the platform reason about who actually showed up.
3. **Anti-leakage through platform value** (`visit-pricing-and-leakage.md` §5). Transparency —
   "the worker has left, ~20 min away" — is itself a reason to stay on the platform; it removes the
   "where is my worker?" anxiety that erodes trust.

So live tracking is a **foundation**, not an add-on: it unlocks the visit-pricing model, the no-show
model, and part of the trust moat at once.

## 3. Design shape

- **Trigger — the worker taps "On my way":** on a confirmed scheduled job, this does three things at
  once: notifies the customer ("Your worker is on the way, ~X min"), starts sharing the worker's
  location with the customer, and records a **departure timestamp**.
- **Arrival — the worker taps "Arrived / Check in"** (or a geofence auto-detects arrival at the job
  address): notifies the customer, stops location sharing, and records an **arrival timestamp**.
- **Asymmetric visibility:** the customer sees the worker's live location; the worker only has the job
  address, not the customer's live position.
- **Job-scoped and time-boxed:** sharing is active only for that trip and stops at arrival, so the
  platform never tracks a worker outside a booking — the privacy line.

## 4. Phasing (so it is actually buildable)

- **Phase 1 — status notifications, no live map (cheapest, most of the value).** The worker taps
  "On my way" → the customer gets "Your worker is on the way" plus a coarse ETA. This **reuses
  existing plumbing** almost entirely: the app already has a WebSocket channel (`attachMessageSocket`,
  used for chat), the scheduling flow, and the notification system. No continuous GPS, no background
  location. It captures ~80% of the value (departure awareness + rough ETA + the timestamps that feed
  no-show adjudication) at a fraction of the cost.
- **Phase 2 — live location on a map.** Continuous worker → customer location streaming during the
  trip. This is where the heavy work lives: **background location permission** (a native capability
  with battery, privacy, and app-store-review weight) and a **routing/maps API** (e.g. Google
  Directions) to compute a real ETA from the worker's live position to the job address (an added
  running cost).
- **Phase 3 — arrival geofence / check-in.** Auto-detect arrival and formalize the check-in, feeding
  the cancellation / no-show adjudication in `visit-pricing-and-leakage.md` §4.

**Recommendation: ship Phase 1 first.** It needs no background location and reuses the WebSocket +
notifications + scheduling that already exist, so it validates the value before committing to the
heavier Phase 2 permissions and routing costs.

## 5. Costs and prerequisites

- **Background location** (Phase 2) is a heavy native permission — battery drain, privacy scrutiny,
  extra app-store review. Phase 1 avoids it entirely (the worker's app is in the foreground when they
  tap "On my way").
- **Routing / ETA API** (Phase 2) has a per-request cost.
- **Privacy scoping** — sharing must be strictly job-scoped and time-boxed, stop at arrival, and
  store minimal (ideally no) location history.
- **Reuses what exists** — WebSocket transport, the two-party scheduling protocol, and the
  notification system are already in place, which is what makes Phase 1 cheap.

## 6. Status

Nothing here is built. This record is the blueprint. Because it unblocks
`docs/visit-pricing-and-leakage.md`, its Phase 1 is a natural first step before the distance-pricing
and no-show-penalty work those records describe. Sequence and scope to be decided when a slice is
scheduled.
