import type { Certification, CertificationStatus } from '../../../shared/schemas.ts';
import { certificationSchema } from '../../../shared/schemas.ts';
import type { CertificationRepository } from './certificationRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const UPSERT = `
  INSERT INTO certifications
    (id, worker_id, category, title, document_url, status, created_at, reviewed_at, reviewer_id, rejection_reason)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    reviewed_at = EXCLUDED.reviewed_at,
    reviewer_id = EXCLUDED.reviewer_id,
    rejection_reason = EXCLUDED.rejection_reason
`;

interface CertificationRow {
  id: string;
  worker_id: string;
  category: string;
  title: string;
  document_url: string;
  status: string;
  created_at: string | Date;
  reviewed_at: string | Date | null;
  reviewer_id: string | null;
  rejection_reason: string | null;
}

function mapRow(row: unknown): Certification {
  const r = row as CertificationRow;
  return certificationSchema.parse({
    id: r.id,
    workerId: r.worker_id,
    category: r.category,
    title: r.title,
    documentUrl: r.document_url,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.reviewed_at !== null ? { reviewedAt: new Date(r.reviewed_at).toISOString() } : {}),
    ...(r.reviewer_id !== null ? { reviewerId: r.reviewer_id } : {}),
    ...(r.rejection_reason !== null ? { rejectionReason: r.rejection_reason } : {}),
  });
}

export class PostgresCertificationRepository implements CertificationRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(certification: Certification): Promise<void> {
    await this.db.query(UPSERT, [
      certification.id,
      certification.workerId,
      certification.category,
      certification.title,
      certification.documentUrl,
      certification.status,
      certification.createdAt,
      certification.reviewedAt ?? null,
      certification.reviewerId ?? null,
      certification.rejectionReason ?? null,
    ]);
  }

  public async findById(id: string): Promise<Certification | undefined> {
    const result = await this.db.query('SELECT * FROM certifications WHERE id = $1', [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByWorker(workerId: string): Promise<Certification[]> {
    const result = await this.db.query(
      'SELECT * FROM certifications WHERE worker_id = $1 ORDER BY created_at DESC',
      [workerId],
    );
    return result.rows.map(mapRow);
  }

  public async findByStatus(status: CertificationStatus): Promise<Certification[]> {
    const result = await this.db.query(
      'SELECT * FROM certifications WHERE status = $1 ORDER BY created_at DESC',
      [status],
    );
    return result.rows.map(mapRow);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM certifications');
  }
}
