import { randomUUID } from 'node:crypto';

import type {
  Certification,
  CertificationStatus,
  CreateCertificationInput,
  Principal,
  ReviewCertificationInput,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { certificationRepository } from '../repositories/certificationRepository.ts';
import { recordAuditEvent } from './auditService.ts';
import { recordNotification } from './notificationService.ts';

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

/** Admin-only: certifications with a given status (the review queue when `pending`). */
export async function listCertificationsByStatus(
  status: CertificationStatus,
  principal: Principal,
): Promise<Certification[]> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may review certifications', 403);
  }
  return certificationRepository.findByStatus(status);
}

/**
 * Admin-only: verify or reject a pending certification. Only a `pending` one can be
 * reviewed (409 otherwise); a rejection requires a reason. The worker is notified and
 * the decision is audited. A verified certification is what unlocks the category's
 * jobs (enforced in matching, slice 142c).
 */
export async function reviewCertification(
  id: string,
  input: ReviewCertificationInput,
  principal: Principal,
): Promise<Certification> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may review certifications', 403);
  }
  const certification = await certificationRepository.findById(id);
  if (!certification) {
    throw new AppError('Certification not found', 404);
  }
  if (certification.status !== 'pending') {
    throw new AppError('This certification has already been reviewed', 409);
  }

  const reason = input.reason?.trim();
  if (input.decision === 'reject' && (reason === undefined || reason === '')) {
    throw new AppError('A reason is required to reject a certification', 422);
  }

  const reviewedAt = new Date().toISOString();
  const updated: Certification =
    input.decision === 'verify'
      ? { ...certification, status: 'verified', reviewedAt, reviewerId: principal.id }
      : {
          ...certification,
          status: 'rejected',
          reviewedAt,
          reviewerId: principal.id,
          rejectionReason: reason,
        };
  await certificationRepository.save(updated);

  await recordNotification({
    userId: certification.workerId,
    message:
      input.decision === 'verify'
        ? `Your "${certification.title}" certification was verified. You can now take ${certification.category} jobs.`
        : `Your "${certification.title}" certification was rejected: ${reason ?? ''}`,
  });
  await recordAuditEvent({
    actor: principal,
    action: input.decision === 'verify' ? 'certification.verified' : 'certification.rejected',
    resourceId: certification.id,
    details: { workerId: certification.workerId, category: certification.category },
  });
  return updated;
}

export async function resetCertifications(): Promise<void> {
  await certificationRepository.clear();
}
