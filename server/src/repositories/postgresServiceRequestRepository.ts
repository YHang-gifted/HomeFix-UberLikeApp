import type { ServiceRequest } from '../../../shared/schemas.ts';
import { serviceRequestSchema } from '../../../shared/schemas.ts';
import type { ServiceRequestRepository } from './serviceRequestRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO service_requests
    (id, customer_id, worker_id, category, description, latitude, longitude, status, created_at, photo_urls, scheduled_at, address, schedule_status, schedule_proposed_by)
  -- COALESCE mirrors the schema's scheduleStatus default on the read side: an explicit NULL
  -- from a caller that predates the column would otherwise override the column DEFAULT and
  -- trip the NOT NULL constraint (an explicit NULL does not fall back to DEFAULT).
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, COALESCE($13, 'unset'), $14)
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    worker_id = EXCLUDED.worker_id,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    status = EXCLUDED.status,
    created_at = EXCLUDED.created_at,
    photo_urls = EXCLUDED.photo_urls,
    scheduled_at = EXCLUDED.scheduled_at,
    address = EXCLUDED.address,
    schedule_status = EXCLUDED.schedule_status,
    schedule_proposed_by = EXCLUDED.schedule_proposed_by
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
  photo_urls: unknown;
  scheduled_at: string | Date | null;
  address: string | null;
  schedule_status: string;
  schedule_proposed_by: string | null;
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
    ...(r.address !== null ? { address: r.address } : {}),
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    photoUrls: Array.isArray(r.photo_urls) ? r.photo_urls : [],
    ...(r.scheduled_at !== null ? { scheduledAt: new Date(r.scheduled_at).toISOString() } : {}),
    // `schedule_status` is NOT NULL DEFAULT 'unset' (migration 0038), so it is always present.
    scheduleStatus: r.schedule_status,
    ...(r.schedule_proposed_by !== null ? { scheduleProposedBy: r.schedule_proposed_by } : {}),
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
      JSON.stringify(request.photoUrls ?? []),
      request.scheduledAt ?? null,
      request.address ?? null,
      request.scheduleStatus,
      request.scheduleProposedBy ?? null,
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

  public async assignWorkerIfPending(
    id: string,
    workerId: string,
  ): Promise<ServiceRequest | undefined> {
    // The WHERE guard makes this a single atomic claim: a concurrent second
    // UPDATE finds worker_id already set (or status no longer pending) and
    // matches no row, so only one claimant wins.
    const result = await this.db.query(
      `UPDATE service_requests
          SET worker_id = $2, status = 'matched'
        WHERE id = $1 AND status = 'pending' AND worker_id IS NULL
        RETURNING *`,
      [id, workerId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async releaseIfAssignedWorker(
    id: string,
    workerId: string,
  ): Promise<ServiceRequest | undefined> {
    // Single atomic check-and-set: only the assigned worker releases, and only
    // from an active state; the request returns to the pool as pending.
    const result = await this.db.query(
      `UPDATE service_requests
          SET worker_id = NULL, status = 'pending',
              scheduled_at = NULL, schedule_status = 'unset', schedule_proposed_by = NULL
        WHERE id = $1
          AND worker_id = $2
          AND status IN ('matched', 'accepted', 'in_progress')
        RETURNING *`,
      [id, workerId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async releaseToPending(id: string): Promise<ServiceRequest | undefined> {
    // Admin override: no worker_id constraint, only the active-status guard.
    const result = await this.db.query(
      `UPDATE service_requests
          SET worker_id = NULL, status = 'pending',
              scheduled_at = NULL, schedule_status = 'unset', schedule_proposed_by = NULL
        WHERE id = $1 AND status IN ('matched', 'accepted', 'in_progress')
        RETURNING *`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findAll(): Promise<ServiceRequest[]> {
    const result = await this.db.query('SELECT * FROM service_requests');
    return result.rows.map((row) => mapRow(row));
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM service_requests');
  }
}
