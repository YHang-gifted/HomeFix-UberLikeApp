import type { AuditEvent } from '../../../shared/schemas.ts';
import { auditEventSchema } from '../../../shared/schemas.ts';
import type { AuditRepository } from './auditRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const INSERT = `
  INSERT INTO audit_events
    (id, occurred_at, actor_id, actor_role, action, resource_id, details)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
`;

interface AuditRow {
  id: string;
  occurred_at: string | Date;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  resource_id: string | null;
  details: Record<string, string> | null;
}

function mapRow(row: unknown): AuditEvent {
  const r = row as AuditRow;
  const candidate = {
    id: r.id,
    occurredAt: new Date(r.occurred_at).toISOString(),
    action: r.action,
    ...(r.actor_id !== null ? { actorId: r.actor_id } : {}),
    ...(r.actor_role !== null ? { actorRole: r.actor_role } : {}),
    ...(r.resource_id !== null ? { resourceId: r.resource_id } : {}),
    ...(r.details !== null ? { details: r.details } : {}),
  };
  return auditEventSchema.parse(candidate);
}

export class PostgresAuditRepository implements AuditRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async append(event: AuditEvent): Promise<void> {
    await this.db.query(INSERT, [
      event.id,
      event.occurredAt,
      event.actorId ?? null,
      event.actorRole ?? null,
      event.action,
      event.resourceId ?? null,
      event.details !== undefined ? JSON.stringify(event.details) : null,
    ]);
  }

  public async findAll(): Promise<AuditEvent[]> {
    const result = await this.db.query('SELECT * FROM audit_events');
    return result.rows.map(mapRow);
  }

  public async findByResource(resourceId: string): Promise<AuditEvent[]> {
    const result = await this.db.query('SELECT * FROM audit_events WHERE resource_id = $1', [
      resourceId,
    ]);
    return result.rows.map(mapRow);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM audit_events');
  }
}
