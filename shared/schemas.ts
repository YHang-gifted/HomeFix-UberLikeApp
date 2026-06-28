import { z } from 'zod';

export const roleSchema = z.enum(['customer', 'worker', 'admin']);
export type Role = z.infer<typeof roleSchema>;

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

export const phoneSchema = z.string().regex(/^[+]?[\d ()-]{7,20}$/, 'Enter a valid phone number');

export const requestContactsSchema = z.object({
  customerPhone: phoneSchema.optional(),
  workerPhone: phoneSchema.optional(),
});
export type RequestContacts = z.infer<typeof requestContactsSchema>;

// A worker's self-description and the categories they serve, shown to customers.
export const workerBioSchema = z.string().min(1).max(1000);
export const workerSkillsSchema = z.array(serviceCategorySchema).max(12);

export const workerSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
  bio: workerBioSchema.optional(),
  skills: workerSkillsSchema.optional(),
});
export type WorkerSummary = z.infer<typeof workerSummarySchema>;

export const workerSummaryListSchema = z.array(workerSummarySchema);

export const auditActionSchema = z.enum([
  'service_request.created',
  'service_request.assigned',
  'service_request.status_changed',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorId: z.uuid(),
  actorRole: roleSchema,
  action: auditActionSchema,
  resourceId: z.uuid(),
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
});
export type UserProfile = z.infer<typeof userProfileSchema>;

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

// Mock/sandbox payments only — no real money moves and no external provider is
// contacted. A payment is a record on a request that a customer can mark "paid".
export const paymentStatusSchema = z.enum(['pending', 'paid']);
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
});
export type Payment = z.infer<typeof paymentSchema>;

// A customer's payment history (most-recent-first), returned by GET /payments.
export const paymentListSchema = z.object({
  items: z.array(paymentSchema),
});
export type PaymentList = z.infer<typeof paymentListSchema>;

// Minimum chargeable amount, NT$1.00. Guards against zero/near-zero quotes and
// payments that are almost certainly mistakes.
export const MIN_AMOUNT_CENTS = 100;

export const createPaymentInputSchema = z.object({
  amountCents: z.number().int().min(MIN_AMOUNT_CENTS).max(100_000_000),
});
export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;

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
