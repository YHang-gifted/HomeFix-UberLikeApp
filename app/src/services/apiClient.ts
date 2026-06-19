import type { CreateServiceRequestInput, ServiceRequest } from '../../../shared/schemas.ts';
import { serviceRequestSchema } from '../../../shared/schemas.ts';

export class ApiError extends Error {
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH';

export class ApiClient {
  private readonly baseUrl: string;
  private token: string | undefined;

  public constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public setToken(token: string | undefined): void {
    this.token = token;
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
