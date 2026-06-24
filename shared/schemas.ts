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

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const workerSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string().min(1).max(120),
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

export const ratingSchema = z.number().int().min(1).max(5);

export const reviewSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  customerId: z.uuid(),
  workerId: z.uuid(),
  rating: ratingSchema,
  comment: z.string().min(1).max(1000).optional(),
  createdAt: z.iso.datetime(),
});
export type Review = z.infer<typeof reviewSchema>;

export const createReviewInputSchema = z.object({
  rating: ratingSchema,
  comment: z.string().min(1).max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewInputSchema>;

export const workerReviewsSchema = z.object({
  workerId: z.uuid(),
  reviewCount: z.number().int().nonnegative(),
  averageRating: z.number(),
  items: z.array(reviewSchema),
});
export type WorkerReviews = z.infer<typeof workerReviewsSchema>;

export const userProfileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: roleSchema,
  displayName: z.string().min(1).max(120),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const publicUserSchema = z.object({
  id: z.uuid(),
  displayName: z.string().min(1).max(120),
  role: roleSchema,
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const updateProfileInputSchema = z.object({
  displayName: z.string().min(1).max(120),
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
