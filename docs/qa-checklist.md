# HomeFix — End-to-End / Device QA Checklist

_A manual test pass for a real build, covering the three roles (customer, worker,
admin) and the cross-cutting behaviors. Tick each item; note the build, device,
and date at the bottom. Pair this with the automated suite (`npm test`,
`app-expo` jest) — this checklist is for what unit/integration tests can't cover:
real devices, native modules, and full user journeys._

## 0. Prerequisites & environment

- [ ] Backend running with a real Postgres (`DATABASE_URL` set); migrations
      `0001`–`0011` applied on boot.
- [ ] `JWT_SECRET` set to a strong, non-default value (the server refuses to boot
      in production otherwise).
- [ ] `CORS_ALLOWED_ORIGINS` set to the app/web origin(s) if testing from a
      browser build.
- [ ] `GET /health` returns 200; `GET /ready` returns 200 (DB reachable).
- [ ] App points at the correct API base URL.
- [ ] Test accounts available: at least one customer, one worker, one admin
      (register new ones or use seeded demo users).
- [ ] **Notifications:** set `NOTIFY_CHANNELS` to enable channels. With no
      provider configured the sender is **inert (logs only)**; set `EMAIL_*`
      (email) and/or `PUSH_API_URL` (push) to actually send — see §7.
- [ ] **Push:** running on a physical device / dev build (Expo push token isn't
      available in a plain simulator/web); notification permission can be granted.
- [ ] **Geocoding:** address search depends on the platform's geocoding provider;
      have a known address ready, and a fallback plan to enter coordinates
      manually.

## 1. Smoke

- [ ] App launches; splash → login.
- [ ] Invalid login shows an error; valid login enters the app.
- [ ] Session persists across an app restart (no re-login required).
- [ ] Sign out returns to login; a protected call after token expiry signs the
      user out automatically.

## 2. Customer — end-to-end

- [ ] Register a brand-new customer account and land signed in.
- [ ] Create a request: pick a category, enter a description.
- [ ] Location: "Use my current location" fills coordinates (grant permission).
- [ ] Location: **address search** — type an address, search, pick a result; the
      latitude/longitude fields fill. (If geocoding returns nothing, the friendly
      message shows and manual entry still works.)
- [ ] Add 1–2 photo URLs; submit; the new request appears in the list.
- [ ] Open the request detail: category, description, photos, location, created
      time, and the activity timeline are correct.
- [ ] Pull-to-refresh and "Load more" pagination work on the list.
- [ ] Search and the status-filter chips narrow the list correctly.
- [ ] After a worker is assigned and sends a quote: the **Quote** section shows
      the amount/note; **Accept** and **Decline** work; status label updates.
- [ ] After accepting a quote: the **Payment** amount is **prefilled** from the
      quote; "Set up payment" then "Pay now" mark it paid (mock — no real charge).
- [ ] Favorite/unfavorite the assigned worker; it appears in the Favorites list.
- [ ] Open Messages for the request; send a message; it appears in the thread.
- [ ] Cancel a still-cancellable request with a reason; the reason shows in the
      timeline.
- [ ] On a completed request: leave a rating + comment; a second attempt shows
      "already reviewed".
- [ ] Notifications screen shows in-app notifications; the unread badge updates;
      "mark all read" clears it.

## 3. Worker — end-to-end

- [ ] Register/log in as a worker.
- [ ] "Find work" / Available jobs lists pending, unassigned requests.
- [ ] **Category chips** filter the available list; the empty state is
      category-specific.
- [ ] Claim a job; it disappears from the available list and appears under the
      worker's jobs; the owning customer is notified.
- [ ] On an assigned request, **propose a quote** (amount + optional note); the
      customer is notified. A non-assigned worker cannot propose.
- [ ] Advance the request through its statuses (accepted → in_progress →
      completed); each transition is allowed only where valid.
- [ ] Worker sees the payment status but has no pay action.
- [ ] Contact phone numbers are visible only to the request's parties.
- [ ] Register the device for push on sign-in (permission prompt appears once);
      no crash if permission is denied.

## 4. Admin — end-to-end

- [ ] Log in as admin.
- [ ] Assign a worker to a pending request; the worker list is ordered by rating;
      the assignment is recorded with the worker's name in the timeline.
- [ ] Admin can view any request's detail and history.
- [ ] Audit log screen lists events with correct actor/action and paginates.

## 5. Matching & concurrency

- [ ] Two workers claiming the same job near-simultaneously: exactly one wins; the
      other gets a clear "no longer available" message; the request ends with a
      single assigned worker.
- [ ] A worker cannot claim a request that is already assigned or not pending.

## 6. Authorization & validation (negative cases)

- [ ] A customer cannot act on another customer's request (view-gated where
      appropriate, 403 on mutations).
- [ ] A worker cannot propose a quote for a request they're not assigned to.
- [ ] Payment requires an **accepted quote of the matching amount** (a mismatched
      or missing quote is rejected).
- [ ] Quote and payment amounts below NT$1 are rejected.
- [ ] Invalid ids return a 422 "Invalid … id"; unauthenticated calls return 401.
- [ ] Rapid repeated login/register attempts get rate-limited (429).

## 7. Notifications delivery (caveats)

- [ ] In-app notifications always work (created on the relevant actions).
- [ ] With `NOTIFY_CHANNELS=email,push` but **no provider configured**, server
      logs show delivery attempts for the resolved recipients (email = the user's
      email; push = a registered device token) via the inert sender — logs only,
      no real send.
- [ ] With `EMAIL_API_URL`/`EMAIL_API_KEY`/`EMAIL_FROM` set, the `email` channel
      **actually sends** (the provider receives a `{ from, to, subject, text }`
      POST); confirm a real inbox, not just logs.
- [ ] With `PUSH_API_URL` set (e.g. the Expo push API), the `push` channel
      **actually sends** (a `{ to, title, body }` POST); confirm a real device
      banner. A non-2xx provider response is logged and isolated — other channels
      still deliver.
- [ ] A user with no registered push token (or no email) is simply skipped — no
      error, the triggering action still succeeds.

## 8. Location & geocoding (caveats)

- [ ] Current-location fill works on a device with permission granted.
- [ ] Address search resolves a known address to coordinates.
- [ ] **Known limitation:** forward-geocoding availability/accuracy depends on the
      platform/provider configuration; an unconfigured environment may return no
      results — the manual coordinate entry is the fallback.

## 9. Resilience & UX spot-checks

- [ ] Airplane mode / server down: actions show a friendly error, not a crash.
- [ ] Worker "Find work" screen loads without freezing (no render loop).
- [ ] Large lists scroll smoothly; pagination doesn't duplicate or drop items.
- [ ] Back/forward navigation preserves expected state.

## 10. Accessibility & performance (spot-checks)

- [ ] Buttons and inputs have sensible labels (screen-reader pass on key screens:
      login, create request, request detail, available jobs).
- [ ] Tap targets are large enough; text is legible; color contrast is adequate.
- [ ] Cold start and screen transitions feel responsive on a mid-range device.

## 11. Known limitations to confirm (not bugs)

- [ ] Payments are **mock** — no real money moves.
- [ ] Notification email/p
