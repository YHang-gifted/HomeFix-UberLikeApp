import type {
  AuditEvent,
  AuditPage,
  CreateQuoteInput,
  CreateReviewInput,
  CreateServiceRequestInput,
  Message,
  Notification,
  NotificationList,
  Payment,
  Principal,
  PublicUser,
  Quote,
  RegisterInput,
  RequestContacts,
  Review,
  ServiceRequest,
  ServiceRequestPage,
  ServiceRequestStatus,
  UpdateProfileInput,
  UserProfile,
  WorkerRating,
  WorkerReviews,
  WorkerSummary,
} from '../../../shared/schemas.ts';
import {
  auditPageSchema,
  deviceTokenListSchema,
  messageListSchema,
  messageSchema,
  notificationListSchema,
  notificationSchema,
  paymentListSchema,
  paymentSchema,
  publicUserListSchema,
  publicUserSchema,
  quoteSchema,
  requestContactsSchema,
  requestHistorySchema,
  reviewSchema,
  serviceRequestPageSchema,
  serviceRequestSchema,
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

  public async getMe(): Promise<UserProfile> {
    const data = await this.send('GET', '/me', undefined, true);
    return userProfileSchema.parse(data);
  }

  public async updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
    const data = await this.send('PATCH', '/me', input, true);
    return userProfileSchema.parse(data);
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

  public async listMyPayments(): Promise<Payment[]> {
    const data = await this.send('GET', '/payments', undefined, true);
    return paymentListSchema.parse(data).items;
  }

  public async createPayment(id: string, amountCents: number): Promise<Payment> {
    const data = await this.send('POST', `/service-requests/${id}/payment`, { amountCents }, true);
    return paymentSchema.parse(data);
  }

  public async payPayment(id: string): Promise<Payment> {
    const data = await this.send('POST', `/service-requests/${id}/payment/pay`, undefined, true);
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
