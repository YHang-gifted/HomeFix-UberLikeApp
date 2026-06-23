import type { ServiceRequest } from '../../../shared/schemas.ts';
import { serviceRequestSchema } from '../../../shared/schemas.ts';
import type { ServiceRequestRepository } from './serviceRequestRepository.ts';

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

const UPSERT = `
  INSERT INTO service_requests
    (id, customer_id, worker_id, category, description, latitude, longitude, status, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    worker_id = EXCLUDED.worker_id,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    status = EXCLUDED.status,
    created_at = EXCLUDED.created_at
`;

interface ServiceRequestRow {
  id: string;
  customer_id: string;
  worker_id: string | null;
  category: string;
  description: string;
  latitude: number;
  longitude: number;
  status: string;
  created_at: string | Date;
}

function mapRow(row: unknown): ServiceRequest {
  const r = row as ServiceRequestRow;
  const candidate = {
    id: r.id,
    customerId: r.customer_id,
    ...(r.worker_id !== null ? { workerId: r.worker_id } : {}),
    category: r.category,
    description: r.description,
    location: { latitude: r.latitude, longitude: r.longitude },
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  };
  return serviceRequestSchema.parse(candidate);
}

export class PostgresServiceRequestRepository implements ServiceRequestRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(request: ServiceRequest): Promise<void> {
    await this.db.query(UPSERT, [
      request.id,
      request.customerId,
      request.workerId ?? null,
      request.category,
      request.description,
      request.location.latitude,
      request.location.longitude,
      request.status,
      request.createdAt,
    ]);
  }

  public async findById(id: string): Promise<ServiceRequest | undefined> {
    const result = await this.db.query('SELECT * FROM service_requests WHERE id = $1', [id]);
    const row = result.rows[0];
    if (row === undefined) {
      return undefined;
    }
    return mapRow(row);
  }

  public async findAll(): Promise<ServiceRequest[]> {
    const result = await this.db.query('SELECT * FROM service_requests');
    return result.rows.map((row) => mapRow(row));
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM service_requests');
  }
}
