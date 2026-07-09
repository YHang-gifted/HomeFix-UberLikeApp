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
});
export type CreateServiceRequestInput = z.infer<typeof createServiceRequestInputSchema>;

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
  // Optional preferred time for the visit (ISO 8601).
  scheduledAt: z.iso.datetime().optional(),
});
export type ServiceRequest = z.infer<typeof serviceRequestSchema>;

export const serviceRequestPageSchema = z.object({
  items: z.array(serviceRequestSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type ServiceRequestPage = z.infer<typeof serviceRequestPageSchema>;

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
  'payment.created',
  'payment.refunded',
  'certification.submitted',
  'certification.verified',
  'certification.rejected',
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

export const paymentSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  customerId: z.uuid(),
  workerId: z.uuid(),
  amountCents: z.number().int().positive(),
  currency: z.literal('TWD'),
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
  // The provider's client secret for completing the payment (e.g. a Stripe
  // PaymentIntent client secret). Ephemeral: returned ONLY on the create-payment
  // response so the app can start checkout; never persisted, never on a later GET.
  clientSecret: z.string().optional(),
  // Hosted checkout URL to redirect the customer to (e.g. a Stripe Checkout page).
  // Ephemeral like `clientSecret`: only on the create-payment response.
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
  currency: z.literal('TWD'),
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

// Minimum chargeable amount, NT$1.00. Guards against zero/near-zero quotes and
// payments that are almost certainly mistakes.
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
  currency: z.literal('TWD'),
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
  currency: z.literal('TWD'),
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
