import { z } from 'zod';

export const roleSchema = z.enum(['customer', 'worker', 'admin']);
export type Role = z.infer<typeof roleSchema>;

/** Account lifecycle state. `suspended` blocks sign-in; `deleted` is a soft-delete (PII scrubbed). */
export const accountStatusSchema = z.enum(['active', 'suspended', 'deleted']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const serviceCategorySchema = z.enum([
  'plumbing',
  'electrical',
  'cleaning',
  'appliance',
  'general',
]);
export type ServiceCategory = z.infer<typeof serviceCategorySchema>;

export const serviceRequestStatusSchema = z.enum([
  'pending',
  'matched',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
]);
export type ServiceRequestStatus = z.infer<typeof serviceRequestStatusSchema>;

/**
 * How the job's price is set. `quote` (the default/legacy path) — a worker proposes a price the
 * customer accepts. `fixed` — a standardized catalog task the platform priced up front
 * (`docs/pricing-model.md`); the price rides on `fixedPriceCents`. Optional (not defaulted) so
 * legacy rows and existing fixtures — which omit it — stay valid; a missing value means `quote`.
 */
export const pricingModeSchema = z.enum(['quote', 'fixed']);
export type PricingMode = z.infer<typeof pricingModeSchema>;

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  email: z.email(),
  displayName: z.string().min(1).max(120),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof userSchema>;

export const createServiceRequestInputSchema = z.object({
  customerId: z.uuid(),
  category: serviceCategorySchema,
  description: z.string().min(1).max(2000),
  location: coordinatesSchema,
  // Optional human-readable address for the location (e.g. from an address search),
  // shown to users instead of raw coordinates. The coordinates remain the canonical
  // value used for matching and maps.
  address: z.string().min(1).max(300).optional(),
  photoUrls: z.array(z.url()).max(5).optional(),
  // Optional preferred time for the visit (ISO 8601).
  scheduledAt: z.iso.datetime().optional(),
  // When set, book a standardized fixed-price catalog task by its id: the server takes the price
  // (and the category) from the catalog, so a customer can never set their own fixed price. Omit
  // for a normal quote-track request.
  catalogItemId: z.string().min(1).max(64).optional(),
});
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestInputSchema>;

/**
 * Where the visit time stands between the two parties.
 * - `unset` — nobody has put a time on the table.
 * - `proposed` — a time is on the table, waiting for the OTHER party to confirm.
 * - `confirmed` — both parties have agreed on `scheduledAt`.
 *
 * Either party may propose a new time at any point (including after `confirmed`, which is
 * how a reschedule is requested — it drops back to `proposed`).
 */
export const scheduleStatusSchema = z.enum(['unset', 'proposed', 'confirmed']);
export type ScheduleStatus = z.infer<typeof scheduleStatusSchema>;

/** Which party put the current `scheduledAt` on the table. Only the other one may confirm it. */
export const scheduleProposerSchema = z.enum(['customer', 'worker']);
export type ScheduleProposer = z.infer<typeof scheduleProposerSchema>;

export const serviceRequestSchema = z.object({
  id: z.uuid(),
  customerId: z.uuid(),
  workerId: z.uuid().optional(),
  category: serviceCategorySchema,
  description: z.string().min(1).max(2000),
  location: coordinatesSchema,
  // Optional human-readable address for the location (see the input schema).
  address: z.string().min(1).max(300).optional(),
  status: serviceRequestStatusSchema,
  createdAt: z.iso.datetime(),
  photoUrls: z.array(z.url()).max(5).optional(),
  // The visit time currently on the table (ISO 8601). Its standing is `scheduleStatus`:
  // a bare `scheduledAt` is only a *proposal* until the other party confirms it.
  scheduledAt: z.iso.datetime().optional(),
  // Defaulted so legacy rows and lightweight fixtures stay valid (a row with no schedule
  // parses as `unset`); the server always sets it.
  scheduleStatus: scheduleStatusSchema.default('unset'),
  scheduleProposedBy: scheduleProposerSchema.optional(),
  // How this job is priced (see pricingModeSchema). Optional so legacy rows/fixtures stay valid; a
  // missing value means `quote`. `fixedPriceCents` is set only for a `fixed` (catalog) job.
  pricingMode: pricingModeSchema.optional(),
  fixedPriceCents: z.number().int().positive().optional(),
  /**
   * The price on this job is **provisional** — it was booked as an assessment visit, so the real
   * total is agreed on site. While true the job cannot be paid (paying would lock the price and
   * block the worker's revision); `reviseQuote` clears it. Optional, so legacy rows/fixtures stay
   * valid; a missing value means the price is final.
   */
  priceProvisional: z.boolean().optional(),
  // Live-tracking (Phase 1): set when the assigned worker taps "on my way" for a confirmed visit,
  // with a rough travel-time ETA (minutes) from their departure location when a maps provider is
  // configured. Both optional, so legacy rows/fixtures stay valid. See `docs/live-tracking.md`.
  enRouteAt: z.iso.datetime().optional(),
  enRouteEtaMinutes: z.number().int().positive().max(1440).optional(),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

/** Propose (or re-propose) a visit time. Either party may send this. */
export const proposeScheduleInputSchema = z.object({
  scheduledAt: z.iso.datetime(),
});
export type ProposeScheduleInput = z.infer<typeof proposeScheduleInputSchema>;

/**
 * The assigned worker sets out for a confirmed visit ("on my way"). Their departure `origin` is
 * optional — sent when the app could read a location so the server can compute a rough ETA, and
 * omitted otherwise (the notification then simply carries no ETA).
 */
export const onMyWayInputSchema = z.object({
  origin: coordinatesSchema.optional(),
});
export type OnMyWayInput = z.infer<typeof onMyWayInputSchema>;

/**
 * A worker's live position, relayed to the request's parties over the WebSocket while they are on
 * the way to a visit (live-tracking Phase 2). Ephemeral — never stored. See `docs/live-tracking.md`.
 * The worker posts a bare {@link coordinatesSchema}; the server stamps `requestId` and `at`.
 */
export const liveLocationSchema = z.object({
  requestId: z.uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  at: z.iso.datetime(),
});
export type LiveLocation = z.infer<typeof liveLocationSchema>;

export const serviceRequestPageSchema = z.object({
  items: z.array(serviceRequestSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type ServiceRequestPage = z.infer<typeof serviceRequestPageSchema>;

/**
 * A standardized, fixed-price task in the catalog — the Uber-style "price-first" track
 * (`docs/pricing-model.md`). `id` is a stable slug (e.g. `drain-unclog`); `priceCents` is the
 * platform-set price in {@link PLATFORM_CURRENCY}, the trusted source a customer books at (so a
 * customer can never invent their own fixed price). Non-standard jobs stay on the quote track.
 */
export const catalogItemSchema = z.object({
  id: z.string().min(1).max(64),
  category: serviceCategorySchema,
  title: z.string().min(1).max(120),
  priceCents: z.number().int().positive(),
  /**
   * An **assessment visit**: the price is a visit fee, and the real total is agreed on site once
   * the worker has seen the job (`docs/pricing-model.md` §6). Booking one marks the request's price
   * as provisional, so it cannot be paid until the worker has revised it — otherwise paying the
   * visit fee up front would lock the price and block the revision.
   */
  assessment: z.boolean().optional(),
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const catalogListSchema = z.object({ items: z.array(catalogItemSchema) });
export type CatalogList = z.infer<typeof catalogListSchema>;

/**
 * A **non-binding** rough price range for a quote-track job, to set the customer's expectation
 * before workers quote (`docs/pricing-model.md` §4). It is explicitly NOT a quote — a photo can't
 * see hidden scope, so it is a range, and it is only ever advisory. Amounts in
 * {@link PLATFORM_CURRENCY} minor units; `lowCents <= highCents`.
 */
export const priceEstimateSchema = z
  .object({
    lowCents: z.number().int().nonnegative(),
    highCents: z.number().int().nonnegative(),
  })
  .refine((e) => e.lowCents <= e.highCents, { message: 'lowCents must be <= highCents' });
export type PriceEstimate = z.infer<typeof priceEstimateSchema>;

// Admin dashboard summary: request counts by status plus payment/worker totals.
const countField = z.number().int().nonnegative();
export const requestsByStatusSchema = z.object({
  pending: countField,
  matched: countField,
  accepted: countField,
  in_progress: countField,
  completed: countField,
  cancelled: countField,
});
export type RequestsByStatus = z.infer<typeof requestsByStatusSchema>;

export const adminStatsSchema = z.object({
  totalRequests: countField,
  requestsByStatus: requestsByStatusSchema,
  paidPaymentsCount: countField,
  paidAmountCents: countField,
  workerCount: countField,
  // Worker payouts (Model B): what is still owed (scheduled, pending) vs. already
  // paid out. Lets an operator see the platform's outstanding liability to workers.
  pendingPayoutsCount: countField,
  pendingPayoutAmountCents: countField,
  paidPayoutsCount: countField,
  paidPayoutAmountCents: countField,
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

// The hosted Stripe Connect onboarding URL a worker is redirected to, to set up payouts.
export const connectOnboardingSchema = z.object({ url: z.url() });
export type ConnectOnboarding = z.infer<typeof connectOnboardingSchema>;

// A freshly opened hosted-checkout session for a pending payment (POST …/payment/checkout).
// Minted on demand so it is never stale — see slice 192. Also the shape returned when opening a
// card-save session (mode: setup) — `startCardSetup` (Phase 2, saved cards).
export const checkoutSessionSchema = z.object({ checkoutUrl: z.url() });
export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;

// A card saved on the customer's Stripe Customer for future in-app payments (Phase 2). Only the
// safe, displayable bits — never the card number; the PAN lives at Stripe. `id` is the Stripe
// `payment_method` id, used later to charge off-session.
export const savedCardSchema = z.object({
  id: z.string(),
  brand: z.string(),
  last4: z.string(),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int(),
});
export type SavedCard = z.infer<typeof savedCardSchema>;

export const savedCardListSchema = z.array(savedCardSchema);

// Paying a pending card payment with one of the customer's saved cards (Uber-style, Phase 3):
// the app says which saved card to charge, the server confirms an off-session PaymentIntent.
export const paySavedCardInputSchema = z.object({ paymentMethodId: z.string() });
export type PaySavedCardInput = z.infer<typeof paySavedCardInputSchema>;

// The outcome of an off-session saved-card charge. `succeeded` → the charge went through and the
// payment settles via the `payment_intent.succeeded` webhook (never synchronously — the webhook
// stays the single settlement authority). `requires_action` → the card needs SCA / 3-D Secure;
// the app completes it natively with `clientSecret`, after which the same webhook settles it.
export const savedCardPaymentResultSchema = z.object({
  status: z.enum(['succeeded', 'requires_action']),
  clientSecret: z.string().optional(),
});
export type SavedCardPaymentResult = z.infer<typeof savedCardPaymentResultSchema>;

/**
 * Where a worker stands with payout onboarding. **Three states, not two** — the middle one is
 * the whole reason this exists.
 *
 * - `none`     — no connected account yet. They have never started.
 * - `pending`  — an account exists, but Stripe has NOT confirmed it can receive payouts.
 *                Returning from the hosted onboarding does **not** mean it is finished (see
 *                `docs/connect-go-live.md`): Stripe may still be verifying, or be waiting on
 *                details the worker did not supply. Payouts are held (`tryTransferPayout`
 *                gates on `stripePayoutsEnabled`) and will flush by themselves once the
 *                `account.updated` webhook says the account is ready.
 * - `enabled`  — Stripe confirmed it. Money can actually move.
 *
 * Collapsing `pending` into either neighbour is what produced the bug this replaces: a worker
 * who had finished onboarding was still shown "Set up payouts", and a worker who was stuck
 * mid-verification was told nothing at all while their payouts silently sat pending.
 */
export const payoutAccountStatusSchema = z.enum(['none', 'pending', 'enabled']);
export type PayoutAccountStatus = z.infer<typeof payoutAccountStatusSchema>;

// A worker's own earnings summary (Model B payouts): what has been paid out vs. what is
// still scheduled (pending). Amounts are the worker's net, in minor units.
export const earningsSummarySchema = z.object({
  pendingCount: countField,
  pendingAmountCents: countField,
  paidCount: countField,
  paidAmountCents: countField,
});
export type EarningsSummary = z.infer<typeof earningsSummarySchema>;

export const principalSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
});
export type Principal = z.infer<typeof principalSchema>;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

// Self-service sign-up. Admins are never self-registerable — only customer or
// worker accounts can be created this way.
export const registerInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(['customer', 'worker']).default('customer'),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

// Authenticated self-service password change. The new password uses the same
// strength rule as sign-up; the current password is re-verified server-side.
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;

// Forgot-password: request a reset email, then reset with the emailed token.
export const forgotPasswordInputSchema = z.object({ email: z.email() });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

export const resetPasswordInputSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

// Authenticated self-service account deletion (soft-delete / anonymize). The
// current password is re-verified server-side before the account is scrubbed.
export const deleteAccountInputSchema = z.object({
  currentPassword: z.string().min(1),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountInputSchema>;

export const phoneSchema = z.string().regex(/^[+]?[\d ()-]{7,20}$/, 'Enter a valid phone number');

export const requestContactsSchema = z.object({
  customerPhone: phoneSchema.optional(),
  workerPhone: phoneSchema.optional(),
});
export type RequestContacts = z.infer<typeof requestContactsSchema>;

// A worker's self-description and the categories they serve, shown to customers.
export const workerBioSchema = z.string().min(1).max(1000);
export const workerSkillsSchema = z.array(serviceCategorySchema).max(12);
// Whether a worker is currently accepting work. Unset is treated as available.
export const workerAvailabilitySchema = z.enum(['available', 'away']);
export type WorkerAvailability = z.infer<typeof workerAvailabilitySchema>;

export const workerSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
  bio: workerBioSchema.optional(),
  skills: workerSkillsSchema.optional(),
  availability: workerAvailabilitySchema.optional(),
});
export type WorkerSummary = z.infer<typeof workerSummarySchema>;

export const workerSummaryListSchema = z.array(workerSummarySchema);

export const auditActionSchema = z.enum([
  'service_request.created',
  'service_request.assigned',
  'service_request.status_changed',
  'account.registered',
  'account.logged_in',
  'account.login_failed',
  'account.suspended',
  'account.reinstated',
  'account.deleted',
  'account.password_changed',
  'account.sessions_revoked',
  'profile.updated',
  'device.registered',
  'quote.proposed',
  'quote.accepted',
  'quote.declined',
  'quote.revised',
  'schedule.proposed',
  'schedule.confirmed',
  'visit.en_route',
  'payment.created',
  'payment.refunded',
  'certification.submitted',
  'certification.verified',
  'certification.rejected',
  'refund_request.created',
  'refund_request.approved',
  'refund_request.rejected',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  // Actor and resource are optional: a system/anonymous event (e.g. a failed login
  // for an unknown email) has no user to attribute and no resource to point at.
  actorId: z.uuid().optional(),
  actorRole: roleSchema.optional(),
  action: auditActionSchema,
  resourceId: z.uuid().optional(),
  details: z.record(z.string(), z.string()).optional(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

export const requestHistorySchema = z.array(auditEventSchema);
export type RequestHistory = z.infer<typeof requestHistorySchema>;

export const messageSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  senderId: z.uuid(),
  senderRole: roleSchema,
  body: z.string().min(1).max(2000),
  createdAt: z.iso.datetime(),
});
export type Message = z.infer<typeof messageSchema>;

export const messageListSchema = z.array(messageSchema);
export type MessageList = z.infer<typeof messageListSchema>;

export const createMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateMessageInput = z.infer<typeof createMessageInputSchema>;

export const ratingSchema = z.number().int().min(1).max(5);

export const reviewSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  customerId: z.uuid(),
  workerId: z.uuid(),
  rating: ratingSchema,
  comment: z.string().min(1).max(1000).optional(),
  createdAt: z.iso.datetime(),
  // The reviewed worker's optional public reply, and when it was posted.
  reply: z.string().min(1).max(1000).optional(),
  repliedAt: z.iso.datetime().optional(),
});
export type Review = z.infer<typeof reviewSchema>;

export const createReviewInputSchema = z.object({
  rating: ratingSchema,
  comment: z.string().min(1).max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

export const replyReviewInputSchema = z.object({
  reply: z.string().min(1).max(1000),
});
export type ReplyReviewInput = z.infer<typeof replyReviewInputSchema>;

export const workerReviewsSchema = z.object({
  workerId: z.uuid(),
  reviewCount: z.number().int().nonnegative(),
  averageRating: z.number(),
  items: z.array(reviewSchema),
});
export type WorkerReviews = z.infer<typeof workerReviewsSchema>;

export const workerRatingSchema = z.object({
  workerId: z.uuid(),
  reviewCount: z.number().int().nonnegative(),
  averageRating: z.number(),
});
export type WorkerRating = z.infer<typeof workerRatingSchema>;

export const workerRatingListSchema = z.array(workerRatingSchema);

export const userProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: roleSchema,
  displayName: z.string().min(1).max(120),
  phone: phoneSchema.optional(),
  bio: workerBioSchema.optional(),
  skills: workerSkillsSchema.optional(),
  availability: workerAvailabilitySchema.optional(),
  /**
   * Payout onboarding state. Present for **workers only** — nobody else can be paid out.
   * Read-only: it is derived from the connected account (and the `account.updated` webhook),
   * never set by the client, so it is absent from `updateProfileInputSchema`.
   */
  payoutAccountStatus: payoutAccountStatusSchema.optional(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

// Admin account-management view of a user. `email`/`displayName` are plain
// strings (not validated) because a soft-deleted account carries scrubbed
// placeholder values.
export const adminUserSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
  status: accountStatusSchema,
});
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export const adminUserListSchema = z.array(adminUserSummarySchema);

// Result of an admin suspend/reinstate action.
export const accountStatusResultSchema = z.object({
  id: z.uuid(),
  status: accountStatusSchema,
});
export type AccountStatusResult = z.infer<typeof accountStatusResultSchema>;

export const publicUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1).max(120),
  role: roleSchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const publicUserListSchema = z.array(publicUserSchema);

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(120),
  phone: phoneSchema.optional(),
  bio: workerBioSchema.optional(),
  skills: workerSkillsSchema.optional(),
  availability: workerAvailabilitySchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const notificationSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  message: z.string().min(1).max(500),
  requestId: z.uuid().optional(),
  read: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;

// Per-user notification channel preferences. A channel is delivered only when it
// is globally enabled (NOTIFY_CHANNELS) AND the recipient has it on here.
export const notificationPreferencesSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

// Partial update: only the channels included are changed.
export const updateNotificationPreferencesInputSchema = z
  .object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
  })
  .refine((value) => value.email !== undefined || value.push !== undefined, {
    message: 'Provide at least one preference to update',
  });
export type UpdateNotificationPreferencesInput = z.infer<
  typeof updateNotificationPreferencesInputSchema
>;

// Mock/sandbox payments only — no real money moves and no external provider is
// contacted. A payment is a record on a request that a customer can mark "paid".
export const paymentStatusSchema = z.enum(['pending', 'paid', 'refunded']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

// Which backend settled a payment: `mock` (dev/test), `stripe`, or `paypal`. Stored on
// the payment so a webhook and an admin refund route to the provider that took it. This
// lets multiple real providers coexist (the customer chooses at checkout).
export const paymentProviderIdSchema = z.enum(['mock', 'stripe', 'paypal']);
export type PaymentProviderId = z.infer<typeof paymentProviderIdSchema>;

// What the customer chooses at checkout: `card` → Stripe hosted Checkout; `paypal` →
// PayPal (which also offers Venmo as a funding option). Resolved to a provider server-side.
export const paymentMethodSchema = z.enum(['card', 'paypal']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * The platform's settlement currency — the single source of truth. The marketplace runs in
 * the **US**, and a Stripe transfer to a worker's connected account must be in the
 * platform's settlement currency, so quotes, payments, and payouts are all denominated
 * here. Amounts are always stored as an integer of the currency's **minor unit**
 * (`amountCents`), i.e. US cents.
 *
 * Changing this is not just a label: it must match the Stripe account's settlement
 * currency, and existing rows must be re-denominated (see migration `0037`) because
 * `paymentSchema.parse` rejects any other value.
 */
export const PLATFORM_CURRENCY = 'USD';

/** Every money-carrying record is in {@link PLATFORM_CURRENCY}. */
export const currencySchema = z.literal(PLATFORM_CURRENCY);

export const paymentSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  customerId: z.uuid(),
  workerId: z.uuid(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
  status: paymentStatusSchema,
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
  // Marketplace split (Model B): the platform's commission and the worker's net.
  // Optional so legacy rows and lightweight fixtures stay valid; the server always
  // populates both on every payment it returns.
  platformFeeCents: z.number().int().nonnegative().optional(),
  workerNetCents: z.number().int().nonnegative().optional(),
  // The payment provider's own reference for this charge (e.g. a Stripe
  // PaymentIntent id). Optional: the mock provider assigns one, and it is how a
  // real provider's webhooks map back to our payment. Legacy rows may lack it.
  providerRef: z.string().optional(),
  // Which backend took this payment (mock/stripe/paypal), so its webhook and any
  // refund route to the right provider. Optional: legacy rows predate the column.
  provider: paymentProviderIdSchema.optional(),
  // The provider's capture/charge reference used to REFUND (PayPal refunds on the
  // capture id, not the order in `providerRef`). Set when a PayPal order is captured.
  captureRef: z.string().optional(),
  // The provider's client secret for completing the payment (e.g. a Stripe
  // PaymentIntent client secret). Ephemeral: returned ONLY on the create-payment
  // response so the app can start checkout; never persisted, never on a later GET.
  clientSecret: z.string().optional(),
  // Hosted checkout URL to redirect the customer to (e.g. a Stripe Checkout page).
  // Ephemeral like `clientSecret`: it is created fresh each time the customer starts checkout
  // (POST …/payment/checkout) and never persisted — a Checkout Session expires, so a stored URL
  // would go stale (see slice 192). Rides only on the response that opened it.
  checkoutUrl: z.url().optional(),
});
export type Payment = z.infer<typeof paymentSchema>;

// A customer's payment history (most-recent-first), returned by GET /payments.
export const paymentListSchema = z.object({
  items: z.array(paymentSchema),
});
export type PaymentList = z.infer<typeof paymentListSchema>;

/**
 * A receipt for a settled (paid) payment — a self-contained, human-presentable
 * record of the transaction. Returned by GET /service-requests/:id/payment/receipt
 * to any party of the request, only once the payment is paid. Derived from the
 * payment + request + parties; nothing new is persisted.
 */
export const receiptSchema = z.object({
  // Deterministic, stable identifier derived from the payment (e.g. HF-20260708-1A2B3C4D).
  receiptNumber: z.string().min(1),
  paymentId: z.uuid(),
  requestId: z.uuid(),
  // When the payment was settled (the payment's paidAt).
  issuedAt: z.iso.datetime(),
  currency: currencySchema,
  amountCents: z.number().int().positive(),
  platformFeeCents: z.number().int().nonnegative(),
  workerNetCents: z.number().int().nonnegative(),
  customerName: z.string().min(1),
  workerName: z.string().min(1),
  category: serviceCategorySchema,
  description: z.string().min(1),
  // The payment provider's charge reference, when one exists (real providers).
  providerRef: z.string().optional(),
});
export type Receipt = z.infer<typeof receiptSchema>;

// A worker's credential for a service category (e.g. an electrician's journeyman
// license). Uploaded by the worker, then reviewed by an admin: only a `verified`
// certification unlocks that category's jobs for the worker. `pending` awaits
// review; `rejected` carries a reason.
export const certificationStatusSchema = z.enum(['pending', 'verified', 'rejected']);
export type CertificationStatus = z.infer<typeof certificationStatusSchema>;

export const certificationSchema = z.object({
  id: z.uuid(),
  workerId: z.uuid(),
  category: serviceCategorySchema,
  // Human-readable credential name, e.g. "Journeyman Electrician License".
  title: z.string().min(1).max(160),
  // URL of the uploaded certificate document (scan/photo/PDF), obtained from the
  // upload endpoint — the credential itself is not stored, only a reference.
  documentUrl: z.url(),
  status: certificationStatusSchema,
  createdAt: z.iso.datetime(),
  // Set when an admin reviews it (verified/rejected).
  reviewedAt: z.iso.datetime().optional(),
  reviewerId: z.uuid().optional(),
  // Reason shown to the worker on a rejection.
  rejectionReason: z.string().min(1).max(500).optional(),
});
export type Certification = z.infer<typeof certificationSchema>;

export const createCertificationInputSchema = z.object({
  category: serviceCategorySchema,
  title: z.string().min(1).max(160),
  documentUrl: z.url(),
});
export type CreateCertificationInput = z.infer<typeof createCertificationInputSchema>;

export const certificationListSchema = z.object({ items: z.array(certificationSchema) });
export type CertificationList = z.infer<typeof certificationListSchema>;

// An admin's review decision for a pending certification. A rejection carries a
// reason shown to the worker (required by the service when decision is 'reject').
export const reviewCertificationInputSchema = z.object({
  decision: z.enum(['verify', 'reject']),
  reason: z.string().min(1).max(500).optional(),
});
export type ReviewCertificationInput = z.infer<typeof reviewCertificationInputSchema>;

// Minimum chargeable amount, US$1.00 (100 cents). Guards against zero/near-zero quotes
// and payments that are almost certainly mistakes. Note it also clears Stripe's own
// minimum charge (US$0.50).
export const MIN_AMOUNT_CENTS = 100;

// Default platform commission, in basis points (1500 = 15%). Overridable per
// deployment via PLATFORM_FEE_BPS.
export const DEFAULT_PLATFORM_FEE_BPS = 1500;

/**
 * Split a gross payment into the platform's commission and the worker's net
 * (Model B: the worker is paid the remainder after the platform's cut). The fee
 * is floored, so the worker always receives any sub-cent remainder. `feeBps` is
 * in basis points (0–10000).
 */
export function splitPaymentAmount(
  amountCents: number,
  feeBps: number,
): { platformFeeCents: number; workerNetCents: number } {
  const platformFeeCents = Math.floor((amountCents * feeBps) / 10000);
  return { platformFeeCents, workerNetCents: amountCents - platformFeeCents };
}

export const createPaymentInputSchema = z.object({
  amountCents: z.number().int().min(MIN_AMOUNT_CENTS).max(100_000_000),
  // Which method the customer chose. Optional for back-compat (the app may not send
  // it yet); the server resolves it to a provider, defaulting to the configured card
  // provider when absent.
  method: paymentMethodSchema.optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;

// A payment-provider webhook event. Provider-agnostic: `type` is free-form (only
// 'payment.succeeded' is acted on; other event types are acknowledged and
// ignored) and `paymentId` references the platform's own payment.
export const paymentWebhookEventSchema = z.object({
  type: z.string().min(1),
  // The provider's own charge reference (Payment.providerRef). Real providers'
  // webhooks identify the charge by their id, which we map back to our payment.
  providerRef: z.string().min(1),
});
export type PaymentWebhookEvent = z.infer<typeof paymentWebhookEventSchema>;

// A payout of a worker's net earnings (Model B). Created when a payment is paid
// and settled out to the worker's connected account by the provider. Mock by
// default — no real money moves until a provider is wired.
export const payoutStatusSchema = z.enum(['pending', 'paid']);
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

export const payoutSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid(),
  workerId: z.uuid(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
  status: payoutStatusSchema,
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().optional(),
});
export type Payout = z.infer<typeof payoutSchema>;

// A worker's payout history (most-recent-first), returned by GET /payouts.
export const payoutListSchema = z.object({
  items: z.array(payoutSchema),
});
export type PayoutList = z.infer<typeof payoutListSchema>;

// A payout-provider webhook event (provider-agnostic). Only 'payout.paid' is
// acted on; `payoutId` references the platform's own payout.
export const payoutWebhookEventSchema = z.object({
  type: z.string().min(1),
  payoutId: z.uuid(),
});
export type PayoutWebhookEvent = z.infer<typeof payoutWebhookEventSchema>;

// Image uploads. The client asks for an upload target for an allowed image type,
// PUTs the bytes to `uploadUrl`, then stores `publicUrl` (e.g. in a request's
// photoUrls). URLs are relative to the API base; the client resolves them.
export const imageContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type ImageContentType = z.infer<typeof imageContentTypeSchema>;

export const createUploadInputSchema = z.object({
  contentType: imageContentTypeSchema,
});
export type CreateUploadInput = z.infer<typeof createUploadInputSchema>;

export const uploadTargetSchema = z.object({
  id: z.uuid(),
  uploadUrl: z.string(),
  publicUrl: z.string(),
});
export type UploadTarget = z.infer<typeof uploadTargetSchema>;

// A price quote the assigned worker proposes for a request. The owning customer
// accepts or declines it; an accepted quote is what the customer then pays.
export const quoteStatusSchema = z.enum(['pending', 'accepted', 'declined']);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;

export const quoteSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  customerId: z.uuid(),
  workerId: z.uuid(),
  amountCents: z.number().int().positive(),
  currency: currencySchema,
  note: z.string().max(500).optional(),
  status: quoteStatusSchema,
  createdAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().optional(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const createQuoteInputSchema = z.object({
  amountCents: z.number().int().min(MIN_AMOUNT_CENTS).max(100_000_000),
  note: z.string().trim().max(500).optional(),
});
export type CreateQuoteInput = z.infer<typeof createQuoteInputSchema>;

/**
 * An on-site scope change: the assigned worker found extra work and proposes a revised total. A
 * `reason` is required — the customer is being asked to agree to a new price, so they must be told
 * why (`docs/pricing-model.md` §5). This is how a fixed-price catalog job absorbs a bigger job than
 * the photos showed, without up-front haggling.
 */
export const reviseQuoteInputSchema = z.object({
  amountCents: z.number().int().min(MIN_AMOUNT_CENTS).max(100_000_000),
  reason: z.string().trim().min(1).max(500),
});
export type ReviseQuoteInput = z.infer<typeof reviseQuoteInputSchema>;

/**
 * A customer-initiated refund request on a paid payment. `open` awaits an admin decision;
 * `approved` means the admin refunded the payment (reusing the existing refund line); `rejected`
 * means the admin declined; `withdrawn` is reserved for a customer cancelling their own request.
 */
export const refundRequestStatusSchema = z.enum(['open', 'approved', 'rejected', 'withdrawn']);
export type RefundRequestStatus = z.infer<typeof refundRequestStatusSchema>;

export const refundRequestSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  paymentId: z.uuid(),
  customerId: z.uuid(),
  reason: z.string().max(1000),
  status: refundRequestStatusSchema,
  createdAt: z.iso.datetime(),
  // Set when an admin resolves the request (approved/rejected).
  resolvedAt: z.iso.datetime().optional(),
  resolvedBy: z.uuid().optional(),
  resolutionNote: z.string().max(1000).optional(),
});
export type RefundRequest = z.infer<typeof refundRequestSchema>;

export const createRefundRequestInputSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type CreateRefundRequestInput = z.infer<typeof createRefundRequestInputSchema>;

export const refundRequestListSchema = z.object({ items: z.array(refundRequestSchema) });
export type RefundRequestList = z.infer<typeof refundRequestListSchema>;

// An admin's decision on an open refund request. `note` is required to reject (so the customer is
// told why) and optional when approving. Approval drives the existing refund line.
export const resolveRefundRequestInputSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).optional(),
});
export type ResolveRefundRequestInput = z.infer<typeof resolveRefundRequestInputSchema>;

// A device's push-notification token, registered by a signed-in user so push
// delivery can reach their device(s).
export const registerDeviceTokenInputSchema = z.object({
  token: z.string().trim().min(1).max(512),
});
export type RegisterDeviceTokenInput = z.infer<typeof registerDeviceTokenInputSchema>;

export const deviceTokenListSchema = z.object({
  tokens: z.array(z.string()),
});
export type DeviceTokenList = z.infer<typeof deviceTokenListSchema>;
