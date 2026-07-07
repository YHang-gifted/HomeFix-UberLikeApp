import process from 'node:process';

import type { Certification, CertificationStatus } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresCertificationRepository } from './postgresCertificationRepository.ts';

/**
 * A worker's certifications (credentials per service category). A worker uploads a
 * certification (status `pending`); an admin verifies or rejects it. Only a
 * `verified` certification unlocks that category's jobs (enforced in matching).
 * Backed by Postgres when `DATABASE_URL` is set, with an in-memory fallback.
 */
export interface CertificationRepository {
  save(certification: Certification): Promise<void>;
  findById(id: string): Promise<Certification | undefined>;
  /** A worker's certifications, most-recent-first. */
  findByWorker(workerId: string): Promise<Certification[]>;
  /** All certifications with a given status, most-recent-first (admin review queue). */
  findByStatus(status: CertificationStatus): Promise<Certification[]>;
  clear(): Promise<void>;
}

export class InMemoryCertificationRepository implements CertificationRepository {
  private readonly certifications = new Map<string, Certification>();

  public save(certification: Certification): Promise<void> {
    this.certifications.set(certification.id, certification);
    return Promise.resolve();
  }

  public findById(id: string): Promise<Certification | undefined> {
    return Promise.resolve(this.certifications.get(id));
  }

  public findByWorker(workerId: string): Promise<Certification[]> {
    return Promise.resolve(
      [...this.certifications.values()]
        .filter((certification) => certification.workerId === workerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  public findByStatus(status: CertificationStatus): Promise<Certification[]> {
    return Promise.resolve(
      [...this.certifications.values()]
        .filter((certification) => certification.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  public clear(): Promise<void> {
    this.certifications.clear();
    return Promise.resolve();
  }
}

export function selectCertificationRepository(
  databaseUrl: string | undefined,
): CertificationRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresCertificationRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryCertificationRepository();
}

export const certificationRepository: CertificationRepository = selectCertificationRepository(
  process.env['DATABASE_URL'],
);
