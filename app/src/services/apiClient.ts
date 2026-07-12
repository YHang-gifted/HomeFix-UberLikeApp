import type {
  AccountStatus,
  AdminStats,
  AdminUserSummary,
  AuditEvent,
  AuditPage,
  Certification,
  CertificationStatus,
  ConnectOnboarding,
  CreateCertificationInput,
  CreateQuoteInput,
  CreateReviewInput,
  CreateServiceRequestInput,
  EarningsSummary,
  ImageContentType,
  Message,
  Notification,
  NotificationList,
  NotificationPreferences,
  Payment,
  PaymentMethod,
  Payout,
  Principal,
  PublicUser,
  Quote,
  Receipt,
  RegisterInput,
  RequestContacts,
  Review,
  ServiceCategory,
  ServiceRequest,
  ServiceRequestPage,
  ServiceRequestStatus,
  UpdateNotificationPreferencesInput,
  UpdateProfileInput,
  UploadTarget,
  UserProfile,
  WorkerRating,
  WorkerReviews,
  WorkerSummary,
} from '../../../shared/schemas.ts';
import {
  accountStatusResultSchema,
  adminStatsSchema,
  adminUserListSchema,
  auditPageSchema,
  certificationListSchema,
  certificationSchema,
  connectOnboardingSchema,
  deviceTokenListSchema,
  earningsSummarySchema,
  messageListSchema,
  messageSchema,
  notificationListSchema,
  notificationPreferencesSchema,
  notificationSchema,
  paymentListSchema,
  paymentSchema,
  payoutListSchema,
  publicUserListSchema,
  publicUserSchema,
  quoteSchema,
  receiptSchema,
  requestContactsSchema,
  requestHistorySchema,
  reviewSchema,
  serviceRequestPageSchema,
  serviceRequestSchema,
  uploadTargetSchema,
  userProfileSchema,
  workerRatingListSchema,
  workerReviewsSchema,
  workerSummaryListSchema,
  workerSummarySchema,
} from '../../../shared/schemas.ts';
import { getPrincipalFromToken } from '../auth/token.ts';

export class ApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Structural type guard for ApiError. Avoids cross-module `instanceof`, which
 * is unreliable under tsx on Linux CI (the same .ts can load as two module
 * instances, giving two distinct ApiError classes). `Error` is a single global,
 * so `instanceof Error` plus a name/shape check is stable across modules.
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    error instanceof Error &&
    error.name === 'ApiError' &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class ApiClient {
  private readonly baseUrl: string;
  private token: string | undefined;
  private unauthorizedHandler: (() => void) | undefined;

  public constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public setToken(token: string | undefined): void {
    this.token = token;
  }

  /**
   * Register a handler invoked when an authenticated request is rejected with
   * 401 (e.g. an expired token), so the app can sign the user out. Not called
   * for unauthenticated requests such as login.
   */
  public setUnauthorizedHandler(handler: (() => void) | undefined): void {
    this.unauthorizedHandler = handler;
  }

  /** The current principal decoded from the stored JWT, or null if not signed in. */
  public getPrincipal(): Principal | null {
    return this.token === undefined ? null : getPrincipalFromToken(this.token);
  }

  public async login(email: string, password: string): Promise<string> {
    const data = await this.send('POST', '/auth/login', { email, password }, false);
    const body = data as { token?: unknown };
    if (typeof body.token !== 'string') {
      throw new ApiError(502, 'Invalid login response');
    }
    this.token = body.token;
    return body.token;
  }

  public async register(input: RegisterInput): Promise<string> {
    const data = await this.send('POST', '/auth/register', input, false);
    const body = data as { token?: unknown };
    if (typeof body.token !== 'string') {
      throw new ApiError(502, 'Invalid registration response');
    }
    this.token = body.token;
    return body.token;
  }

  /** Request a password-reset email. Always resolves (no account disclosure). */
  public async forgotPassword(email: string): Promise<void> {
    await this.send('POST', '/auth/forgot-password', { email }, false);
  }

  /** Reset a password using an emailed token. Throws ApiError(400) if invalid/expired. */
  public async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.send('POST', '/auth/reset-password', { token, newPassword }, false);
  }

  /**
   * Change the signed-in user's password (re-verified server-side). The server
   * revokes all existing tokens and returns a fresh one for this device, which we
   * adopt so the current session keeps working. Caller should persist the token
   * via `getToken()`.
   */
  public async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const data = await this.send(
      'POST',
      '/auth/change-password',
      { currentPassword, newPassword },
      true,
    );
    const body = data as { token?: unknown };
    if (typeof body.token === 'string') {
      this.token = body.token;
    }
  }

  /** Log out of all devices: revokes every existing token and adopts a fresh one. */
  public async logoutAll(): Promise<void> {
    const data = await this.send('POST', '/auth/logout-all', undefined, true);
    const body = data as { token?: unknown };
    if (typeof body.token === 'string') {
      this.token = body.token;
    }
  }

  /**
   * Permanently delete (soft-delete / anonymize) the signed-in account after
   * re-verifying the current password. The server revokes every token, so the
   * local token is cleared on success; the caller should sign the user out.
   */
  public async deleteAccount(currentPassword: string): Promise<void> {
    await this.send('POST', '/auth/delete-account', { currentPassword }, true);
    this.token = undefined;
  }

  /** The current bearer token, if signed in (for persisting after a token refresh). */
  public getToken(): string | undefined {
    return this.token;
  }

  public async getMe(): Promise<UserProfile> {
    const data = await this.send('GET', '/me', undefined, true);
    return userProfileSchema.parse(data);
  }

  public async updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
    const data = await this.send('PATCH', '/me', input, true);
    return userProfileSchema.parse(data);
  }

  public async getNotificationPreferences(): Promise<NotificationPreferences> {
    const data = await this.send('GET', '/me/notification-preferences', undefined, true);
    return notificationPreferencesSchema.parse(data);
  }

  public async updateNotificationPreferences(
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    const data = await this.send('PATCH', '/me/notification-preferences', input, true);
    return notificationPreferencesSchema.parse(data);
  }

  public async createServiceRequest(input: CreateServiceRequestInput): Promise<ServiceRequest> {
    const data = await this.send('POST', '/service-requests', input, true);
    return serviceRequestSchema.parse(data);
  }

  public async getServiceRequest(id: string): Promise<ServiceRequest> {
    const data = await this.send('GET', `/service-requests/${id}`, undefined, true);
    return serviceRequestSchema.parse(data);
  }

  public async getRequestContacts(id: string): Promise<RequestContacts> {
    const data = await this.send('GET', `/service-requests/${id}/contacts`, undefined, true);
    return requestContactsSchema.parse(data);
  }

  public async getRequestHistory(id: string): Promise<AuditEvent[]> {
    const data = await this.send('GET', `/service-requests/${id}/history`, undefined, true);
    return requestHistorySchema.parse(data);
  }

  public async listMessages(id: string): Promise<Message[]> {
    const data = await this.send('GET', `/service-requests/${id}/messages`, undefined, true);
    return messageListSchema.parse(data);
  }

  public async getPayment(id: string): Promise<Payment> {
    const data = await this.send('GET', `/service-requests/${id}/payment`, undefined, true);
    return paymentSchema.parse(data);
  }

  /** The receipt for a request's paid payment. Available to any party of the request. */
  public async getPaymentReceipt(id: string): Promise<Receipt> {
    const data = await this.send('GET', `/service-requests/${id}/payment/receipt`, undefined, true);
    return receiptSchema.parse(data);
  }

  public async listMyPayments(): Promise<Payment[]> {
    const data = await this.send('GET', '/payments', undefined, true);
    return paymentListSchema.parse(data).items;
  }

  /** The signed-in worker's payouts (their net earnings), most-recent-first. */
  public async listMyPayouts(): Promise<Payout[]> {
    const data = await this.send('GET', '/payouts', undefined, true);
    return payoutListSchema.parse(data).items;
  }

  /** The signed-in worker's earnings summary (paid-out vs. pending totals). */
  public async getMyEarnings(): Promise<EarningsSummary> {
    const data = await this.send('GET', '/payouts/summary', undefined, true);
    return earningsSummarySchema.parse(data);
  }

  /** Start Stripe Connect payout onboarding; returns the hosted URL to redirect to. */
  public async startConnectOnboarding(): Promise<ConnectOnboarding> {
    const data = await this.send('POST', '/me/connect/onboard', undefined, true);
    return connectOnboardingSchema.parse(data);
  }

  /** The signed-in worker's certifications, most-recent-first. */
  public async listMyCertifications(): Promise<Certification[]> {
    const data = await this.send('GET', '/certifications', undefined, true);
    return certificationListSchema.parse(data).items;
  }

  /** Submit a new certification for admin review. Returns the pending certification. */
  public async submitCertification(input: CreateCertificationInput): Promise<Certification> {
    const data = await this.send('POST', '/certifications', input, true);
    return certificationSchema.parse(data);
  }

  /** Admin-only: certifications with a given status (defaults to the pending queue). */
  public async listAdminCertifications(
    status: CertificationStatus = 'pending',
  ): Promise<Certification[]> {
    const data = await this.send(
      'GET',
      `/admin/certifications?status=${encodeURIComponent(status)}`,
      undefined,
      true,
    );
    return certificationListSchema.parse(data).items;
  }

  /** Admin-only: verify or reject a pending certification. A rejection needs a reason. */
  public async reviewCertification(
    id: string,
    decision: 'verify' | 'reject',
    reason?: string,
  ): Promise<Certification> {
    const body = reason === undefined ? { decision } : { decision, reason };
    const data = await this.send('POST', `/certifications/${id}/review`, body, true);
    return certificationSchema.parse(data);
  }

  public async createPayment(
    id: string,
    amountCents: number,
    method?: PaymentMethod,
  ): Promise<Payment> {
    const body = { amountCents, ...(method !== undefined ? { method } : {}) };
    const data = await this.send('POST', `/service-requests/${id}/payment`, body, true);
    return paymentSchema.parse(data);
  }

  public async payPayment(id: string): Promise<Payment> {
    const data = await this.send('POST', `/service-requests/${id}/payment/pay`, undefined, true);
    return paymentSchema.parse(data);
  }

  /** Capture an approved PayPal order to settle the payment (called on return). */
  public async capturePaypalPayment(id: string): Promise<Payment> {
    const data = await this.send(
      'POST',
      `/service-requests/${id}/payment/paypal/capture`,
      undefined,
      true,
    );
    return paymentSchema.parse(data);
  }

  /** Admin-only: refund a request's paid payment. Returns the refunded payment. */
  public async refundPayment(id: string): Promise<Payment> {
    const data = await this.send('POST', `/service-requests/${id}/payment/refund`, undefined, true);
    return paymentSchema.parse(data);
  }

  public async getQuote(id: string): Promise<Quote> {
    const data = await this.send('GET', `/service-requests/${id}/quote`, undefined, true);
    return quoteSchema.parse(data);
  }

  public async createQuote(id: string, input: CreateQuoteInput): Promise<Quote> {
    const data = await this.send('POST', `/service-requests/${id}/quote`, input, true);
    return quoteSchema.parse(data);
  }

  public async acceptQuote(id: string): Promise<Quote> {
    const data = await this.send('POST', `/service-requests/${id}/quote/accept`, undefined, true);
    return quoteSchema.parse(data);
  }

  public async declineQuote(id: string): Promise<Quote> {
    const data = await this.send('POST', `/service-requests/${id}/quote/decline`, undefined, true);
    return quoteSchema.parse(data);
  }

  public async postMessage(id: string, body: string): Promise<Message> {
    const data = await this.send('POST', `/service-requests/${id}/messages`, { body }, true);
    return messageSchema.parse(data);
  }

  public async listServiceRequests(params?: {
    limit?: number;
    offset?: number;
    status?: ServiceRequestStatus;
    q?: string;
    category?: ServiceCategory;
  }): Promise<ServiceRequestPage> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      query.set('offset', String(params.offset));
    }
    if (params?.status !== undefined) {
      query.set('status', params.status);
    }
    if (params?.q !== undefined && params.q.trim() !== '') {
      query.set('q', params.q.trim());
    }
    if (params?.category !== undefined) {
      query.set('category', params.category);
    }
    const queryString = query.toString();
    const path = queryString.length > 0 ? `/service-requests?${queryString}` : '/service-requests';
    const data = await this.send('GET', path, undefined, true);
    return serviceRequestPageSchema.parse(data);
  }

  public async listAvailableRequests(params?: {
    limit?: number;
    offset?: number;
    category?: string;
  }): Promise<ServiceRequestPage> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      query.set('offset', String(params.offset));
    }
    if (params?.category !== undefined && params.category.trim() !== '') {
      query.set('category', params.category.trim());
    }
    const queryString = query.toString();
    const path =
      queryString.length > 0
        ? `/service-requests/available?${queryString}`
        : '/service-requests/available';
    const data = await this.send('GET', path, undefined, true);
    return serviceRequestPageSchema.parse(data);
  }

  public async updateServiceRequestStatus(
    id: string,
    status: ServiceRequestStatus,
    reason?: string,
  ): Promise<ServiceRequest> {
    const body = { status, ...(reason !== undefined ? { reason } : {}) };
    const data = await this.send('PATCH', `/service-requests/${id}/status`, body, true);
    return serviceRequestSchema.parse(data);
  }

  public async listWorkers(): Promise<WorkerSummary[]> {
    const data = await this.send('GET', '/workers', undefined, true);
    return workerSummaryListSchema.parse(data);
  }

  public async getWorker(id: string): Promise<WorkerSummary> {
    const data = await this.send('GET', `/workers/${id}`, undefined, true);
    return workerSummarySchema.parse(data);
  }

  public async getUser(id: string): Promise<PublicUser> {
    const data = await this.send('GET', `/users/${id}`, undefined, true);
    return publicUserSchema.parse(data);
  }

  public async listUsers(ids: string[]): Promise<PublicUser[]> {
    if (ids.length === 0) {
      return [];
    }
    const query = new URLSearchParams({ ids: ids.join(',') });
    const data = await this.send('GET', `/users?${query.toString()}`, undefined, true);
    return publicUserListSchema.parse(data);
  }

  public async listFavorites(): Promise<PublicUser[]> {
    const data = await this.send('GET', '/favorites', undefined, true);
    return publicUserListSchema.parse(data);
  }

  public async addFavorite(workerId: string): Promise<PublicUser[]> {
    const data = await this.send('PUT', `/favorites/${workerId}`, undefined, true);
    return publicUserListSchema.parse(data);
  }

  public async removeFavorite(workerId: string): Promise<PublicUser[]> {
    const data = await this.send('DELETE', `/favorites/${workerId}`, undefined, true);
    return publicUserListSchema.parse(data);
  }

  public async assignWorker(id: string, workerId: string): Promise<ServiceRequest> {
    const data = await this.send('PATCH', `/service-requests/${id}/assignment`, { workerId }, true);
    return serviceRequestSchema.parse(data);
  }

  public async claimRequest(id: string): Promise<ServiceRequest> {
    const data = await this.send('PATCH', `/service-requests/${id}/claim`, undefined, true);
    return serviceRequestSchema.parse(data);
  }

  public async releaseRequest(id: string): Promise<ServiceRequest> {
    const data = await this.send('PATCH', `/service-requests/${id}/release`, undefined, true);
    return serviceRequestSchema.parse(data);
  }

  public async resetRequest(id: string): Promise<ServiceRequest> {
    const data = await this.send('PATCH', `/service-requests/${id}/reset`, undefined, true);
    return serviceRequestSchema.parse(data);
  }

  /**
   * Put a visit time on the table (or ask to reschedule an agreed one). Either party may
   * call this; the request comes back `proposed`, awaiting the OTHER party's confirmation.
   */
  public async proposeSchedule(id: string, scheduledAt: string): Promise<ServiceRequest> {
    const data = await this.send('POST', `/service-requests/${id}/schedule`, { scheduledAt }, true);
    return serviceRequestSchema.parse(data);
  }

  /** Confirm the time the OTHER party proposed. Confirming your own is refused (409). */
  public async confirmSchedule(id: string): Promise<ServiceRequest> {
    const data = await this.send(
      'POST',
      `/service-requests/${id}/schedule/confirm`,
      undefined,
      true,
    );
    return serviceRequestSchema.parse(data);
  }

  /**
   * Admin-only: cancel a request, refunding a paid payment and reversing the
   * worker's pending payout first. The counterpart to the paid-cancel guard.
   */
  public async adminCancelWithRefund(id: string, reason?: string): Promise<ServiceRequest> {
    const body = reason !== undefined ? { reason } : undefined;
    const data = await this.send('POST', `/service-requests/${id}/cancel`, body, true);
    return serviceRequestSchema.parse(data);
  }

  public async createReview(requestId: string, input: CreateReviewInput): Promise<Review> {
    const data = await this.send('POST', `/service-requests/${requestId}/review`, input, true);
    return reviewSchema.parse(data);
  }

  public async getReview(requestId: string): Promise<Review> {
    const data = await this.send('GET', `/service-requests/${requestId}/review`, undefined, true);
    return reviewSchema.parse(data);
  }

  public async replyToReview(requestId: string, reply: string): Promise<Review> {
    const data = await this.send(
      'POST',
      `/service-requests/${requestId}/review/reply`,
      { reply },
      true,
    );
    return reviewSchema.parse(data);
  }

  public async getWorkerReviews(workerId: string): Promise<WorkerReviews> {
    const data = await this.send('GET', `/workers/${workerId}/reviews`, undefined, true);
    return workerReviewsSchema.parse(data);
  }

  public async listWorkerRatings(): Promise<WorkerRating[]> {
    const data = await this.send('GET', '/worker-ratings', undefined, true);
    return workerRatingListSchema.parse(data);
  }

  public async getAdminStats(): Promise<AdminStats> {
    const data = await this.send('GET', '/admin/stats', undefined, true);
    return adminStatsSchema.parse(data);
  }

  /** Admin-only: list every account for management. */
  public async adminListUsers(): Promise<AdminUserSummary[]> {
    const data = await this.send('GET', '/admin/users', undefined, true);
    return adminUserListSchema.parse(data);
  }

  /** Admin-only: suspend an account. Returns the account's new status. */
  public async adminSuspendUser(id: string): Promise<AccountStatus> {
    const data = await this.send('POST', `/admin/users/${id}/suspend`, undefined, true);
    return accountStatusResultSchema.parse(data).status;
  }

  /** Admin-only: lift a suspension. Returns the account's new status. */
  public async adminReinstateUser(id: string): Promise<AccountStatus> {
    const data = await this.send('POST', `/admin/users/${id}/reinstate`, undefined, true);
    return accountStatusResultSchema.parse(data).status;
  }

  public async listNotifications(): Promise<NotificationList> {
    const data = await this.send('GET', '/notifications', undefined, true);
    return notificationListSchema.parse(data);
  }

  public async markNotificationRead(id: string): Promise<Notification> {
    const data = await this.send('PATCH', `/notifications/${id}/read`, undefined, true);
    return notificationSchema.parse(data);
  }

  public async markAllNotificationsRead(): Promise<NotificationList> {
    const data = await this.send('PATCH', '/notifications/read-all', undefined, true);
    return notificationListSchema.parse(data);
  }

  /** Register this device's push token so push notifications can reach it. */
  public async registerDeviceToken(token: string): Promise<string[]> {
    const data = await this.send('POST', '/me/device-tokens', { token }, true);
    return deviceTokenListSchema.parse(data).tokens;
  }

  public async listAuditEvents(params?: { limit?: number; offset?: number }): Promise<AuditPage> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      query.set('offset', String(params.offset));
    }
    const queryString = query.toString();
    const path = queryString.length > 0 ? `/audit?${queryString}` : '/audit';
    const data = await this.send('GET', path, undefined, true);
    return auditPageSchema.parse(data);
  }

  /** Resolve a server-relative path (e.g. an upload URL) against the API base. */
  public resolveUrl(path: string): string {
    return path.startsWith('/') ? `${this.baseUrl}${path}` : path;
  }

  /** Request an upload target for an image; returns where to PUT and the public URL. */
  public async createUpload(contentType: ImageContentType): Promise<UploadTarget> {
    const data = await this.send('POST', '/uploads', { contentType }, true);
    return uploadTargetSchema.parse(data);
  }

  /** PUT raw image bytes to an upload target's `uploadUrl`. */
  public async putUploadBytes(uploadUrl: string, contentType: string, body: Blob): Promise<void> {
    // A same-origin upload URL (relative, e.g. the mock `/uploads/:id`) hits our
    // own auth-gated endpoint, so it carries the bearer token. An absolute URL is a
    // presigned object-storage URL (e.g. S3): it is already authenticated by its
    // query signature and rejects an extra Authorization header — so we must NOT
    // attach one.
    const sameOrigin = uploadUrl.startsWith('/');
    const headers: Record<string, string> = { 'content-type': contentType };
    if (sameOrigin) {
      if (this.token === undefined) {
        throw new ApiError(401, 'Not authenticated');
      }
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const response = await fetch(this.resolveUrl(uploadUrl), {
      method: 'PUT',
      headers,
      body,
    });
    if (!response.ok) {
      throw new ApiError(response.status, `Upload failed (${String(response.status)})`);
    }
  }

  private async send(
    method: HttpMethod,
    path: string,
    body: unknown,
    authenticated: boolean,
  ): Promise<unknown> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (authenticated) {
      if (this.token === undefined) {
        throw new ApiError(401, 'Not authenticated');
      }
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    const data: unknown = text.length > 0 ? JSON.parse(text) : undefined;

    if (!response.ok) {
      if (response.status === 401 && authenticated) {
        this.unauthorizedHandler?.();
      }
      const errorBody = data as { error?: unknown } | undefined;
      const message =
        typeof errorBody?.error === 'string'
          ? errorBody.error
          : `Request failed (${String(response.status)})`;
      throw new ApiError(response.status, message);
    }
    return data;
  }
}
