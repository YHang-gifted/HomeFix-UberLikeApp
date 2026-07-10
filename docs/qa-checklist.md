# HomeFix — End-to-End / Device QA Checklist

_A manual test pass for a real build, covering the three roles (customer, worker,
admin) and the cross-cutting behaviors. Tick each item; note the build, device,
and date at the bottom. Pair this with the automated suite (`npm test`,
`app-expo` jest) — this checklist is for what unit/integration tests can't cover:
real devices, native modules, and full user journeys._

_The happy-path server loop (customer -> worker -> admin: post, assign, quote,
accept, pay with commission split, payout, message, complete, review, audit) is
also covered automatically by `tests/e2e-smoke.test.mjs` in `npm test`; other server
rules — credential-gated matching (§16), the paid-cancel guard, and admin cancel +
refund (§11) — have their own automated tests too. This checklist adds the device- and
native-module coverage that automation can't._

## 0. Prerequisites & environment

- [ ] Backend running with a real Postgres (`DATABASE_URL` set); all migrations
      (`0001`–`0035`) applied on boot.
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
- [ ] With a Static Maps key set, each list card shows a small **map thumbnail** for
      the request location; with no key the card shows no thumbnail (no broken image).
- [ ] Search and the status-filter chips narrow the list correctly.
- [ ] After a worker is assigned and sends a quote: the **Quote** section shows
      the amount/note; **Accept** and **Decline** work; status label updates.
- [ ] After accepting a quote: the **Payment** amount is **prefilled** from the
      quote; "Set up payment" then "Pay now" mark it paid (mock — no real charge).
- [ ] On a **paid** request, **View receipt** shows the receipt number, the amount
      breakdown (gross, worker net, platform fee), and both parties' names.
- [ ] A **paid** request can no longer be cancelled — the cancel control is hidden,
      and the server rejects a cancel with **422** (SEC-0006).
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
- [ ] **Certifications:** upload a certificate for a category (title + document); it
      lists as **pending**. A rejected one shows the reason; a verified one unlocks
      that category. (See §16 for the full credential-gating flow.)
- [ ] "Find work" / Available jobs lists pending, unassigned requests **only in the
      worker's verified categories** — a worker with no verified certification sees an
      empty list.
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
- [ ] Audit log screen lists events with correct actor/action and paginates (includes
      `account.logged_in` / `account.registered` on sign-in / sign-up).
- [ ] **Certification review:** the review queue lists pending certifications; **Verify**
      unlocks the worker's category, **Reject** requires a reason. (See §16.)
- [ ] **Cancel & refund:** on a **paid** request, the admin-only "Cancel job & refund"
      refunds the payment, reverses the worker's pending payout, and cancels the request.
      If the worker was already paid out it is blocked (**409**, manual clawback). A
      non-admin never sees this control.

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
- [ ] **Web:** the app degrades gracefully. **Address search** is hidden (native-only
      forward geocoding); **current location** uses the browser's geolocation; and
      manual lat/long entry always works. The **map picker** now works on web too when
      `EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY` is set (Google Maps JS) — with no key the "Pick on
      map" button is hidden. Nothing crashes when these features are unavailable.

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

## 11. Payments — split, refund, payout

- [ ] Creating a payment records a **commission split**: the customer sees the
      gross amount, and the "Worker net · Platform fee" line shows the 15% split
      (e.g. NT$1,500 → worker NT$1,275, platform NT$225). Legacy/zero-fee
      payments show no split line.
- [ ] "Pay now" marks the payment **paid** (mock — no real charge) and the worker
      is notified.
- [ ] The paid payment schedules a **pending payout** for the worker net; the
      worker's Payouts screen lists it as pending, then as paid after a
      `payout.paid` webhook.
- [ ] An **admin** can refund a paid payment; the status shows **Refunded** and
      both parties are notified. A worker/customer has no refund action.
- [ ] A refunded request can be re-pooled (released/reset) — the refund remains in
      the audit log.
- [ ] A **paid** request cannot be cancelled, released, or reset (**422**) — the money
      is settled with no orphaning (SEC-0005 / SEC-0006).
- [ ] The admin **"Cancel job & refund"** on a paid request refunds it, reverses the
      worker's **pending** payout, and cancels — but is blocked (**409**) once the
      worker's payout has already settled (manual clawback).

## 12. Notification preferences

- [ ] Profile shows **Email** and **Push** notification toggles reflecting the
      saved preference.
- [ ] Turning a channel **off** stops that channel's delivery while in-app
      notifications still appear; turning it back on resumes delivery. (Delivery =
      globally enabled channels ∩ the user's preference.)
- [ ] A failed toggle reverts the switch (optimistic update rolls back).

## 13. Map picker & image upload (native)

- [ ] Create request → **"Pick on map"** opens the map; dropping/dragging the pin
      and confirming fills the latitude/longitude fields. (Native uses
      react-native-maps; **web** uses Google Maps JS when
      `EXPO_PUBLIC_GOOGLE_MAPS_JS_KEY` is set — otherwise the button is hidden.)
- [ ] Create request → **"Add photo"** picks an image, uploads it, and the photo
      appears on the submitted request. Denying photo permission fails gracefully.

## 14. Observability & backups (operator)

- [ ] Each response carries an `X-Request-Id`; an induced 5xx is logged with
      structured context (request id, method, path, error) while the client only
      sees a generic 500 — no internal detail leaks.
- [ ] `npm run backup:db` produces a timestamped dump from `DATABASE_URL`; a
      restore into a scratch database boots and serves (see `docs/backups.md`).
- [ ] `GET /metrics` returns Prometheus text (request counters + process gauges); when
      `METRICS_TOKEN` is set it requires that bearer token (401 otherwise).

## 15. Known limitations to confirm (not bugs)

- [ ] Payments are **mock** — no real money moves. The provider seam
      (`providerRef`, HMAC-signed webhooks) is real-shaped but backed by an inert
      mock until a provider adapter and credentials are wired.
- [ ] Notification email/push only **actually send** when the provider env vars
      are set (see §7); otherwise the sender logs only.
- [ ] Uploaded images use the in-memory mock store by default (dev/test); set the
      `STORAGE_S3_*` env vars to store them in real S3 (presigned direct upload).

## 16. Certifications — credential-gated matching

- [ ] **Worker upload:** a worker submits a certificate for a category (title +
      document URL); it appears in their list as **pending**.
- [ ] **Gating (pending/rejected):** while a category's certificate is pending or
      rejected, the worker does **not** see or get pushed jobs in that category, and a
      direct claim is **403**.
- [ ] **Admin review:** the admin review queue lists pending certificates; **Verify**
      unlocks the category; **Reject** requires a reason, which the worker then sees.
- [ ] **Gating (verified):** once verified, the category's jobs appear in the worker's
      Available list and can be claimed; a certificate in one category does **not**
      unlock another.
- [ ] **Admin override:** an admin can still **assign** an uncertified worker directly
      (a trusted override); only self-serve claim/visibility is gated.
