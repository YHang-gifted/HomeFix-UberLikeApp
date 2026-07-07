import { randomUUID } from 'node:crypto';

import type {
  Certification,
  CreateCertificationInput,
  Principal,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { certificationRepository } from '../repositories/certificationRepository.ts';
import { recordAuditEvent } from './auditService.ts';

/**
 * A worker submits a certification for review. It starts `pending`; only after an
 * admin verifies it does it unlock that category's jobs. Workers only — a worker can
 * only submit certifications for themselves.
 */
export async function addCertification(
  input: CreateCertificationInput,
  principal: Principal,
): Promise<Certification> {
  if (principal.role !== 'worker') {
    throw new AppError('Only a worker may submit a certification', 403);
  }
  const certification: Certification = {
    id: randomUUID(),
    workerId: principal.id,
    category: input.category,
    title: input.title,
    documentUrl: input.documentUrl,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await certificationRepository.save(certification);
  await recordAuditEvent({
    actor: principal,
    action: 'certification.submitted',
    resourceId: certification.id,
    details: { category: certification.category },
  });
  return certification;
}

/** The signed-in worker's own certifications, most-recent-first. */
export async function listMyCertifications(principal: Principal): Promise<Certification[]> {
  if (principal.role !== 'worker') {
    throw new AppError('Only a worker has certifications', 403);
  }
  return certificationRepository.findByWorker(principal.id);
}

export async function resetCertifications(): Promise<void> {
  await certificationRepository.clear();
}
