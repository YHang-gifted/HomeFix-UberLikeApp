import type {
  AuditPage,
  CreateServiceRequestInput,
  Principal,
  ServiceRequest,
  ServiceRequestPage,
  ServiceRequestStatus,
  WorkerSummary,
} from '../../../shared/schemas.ts';
import {
  auditPageSchema,
  serviceRequestPageSchema,
  serviceRequestSchema,
  workerSummaryListSchema,
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

type HttpMethod = 'GET' | 'POST' | 'PATCH';

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

  public async createServiceRequest(input: CreateServiceRequestInput): Promise<ServiceRequest> {
    const data = await this.send('POST', '/service-requests', input, true);
    return serviceRequestSchema.parse(data);
  }

  public async getServiceRequest(id: string): Promise<ServiceRequest> {
    const data = await this.send('GET', `/service-requests/${id}`, undefined, true);
    return serviceRequestSchema.parse(data);
  }

  public async listServiceRequests(params?: {
    limit?: number;
    offset?: number;
  }): Promise<ServiceRequestPage> {
    const query = new URLSearchParams();
    if (params?.limit !== undefined) {
      query.set('limit', String(params.limit));
    }
    if (params?.offset !== undefined) {
      query.set('offset', String(params.offset));
    }
    const queryString = query.toString();
    const path = queryString.length > 0 ? `/service-requests?${queryString}` : '/service-requests';
    const data = await this.send('GET', path, undefined, true);
    return serviceRequestPageSchema.parse(data);
  }

  public async updateServiceRequestStatus(
    id: string,
    status: ServiceRequestStatus,
  ): Promise<ServiceRequest> {
    const data = await this.send('PATCH', `/service-requests/${id}/status`, { status }, true);
    return serviceRequestSchema.parse(data);
  }

  public async listWorkers(): Promise<WorkerSummary[]> {
    const data = await this.send('GET', '/workers', undefined, true);
    return workerSummaryListSchema.parse(data);
  }

  public async assignWorker(id: string, workerId: string): Promise<ServiceRequest> {
    const data = await this.send('PATCH', `/service-requests/${id}/assignment`, { workerId }, true);
    return serviceRequestSchema.parse(data);
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
