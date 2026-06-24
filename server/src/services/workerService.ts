import type { Principal, WorkerSummary } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { findUserById, listUsersByRole } from '../repositories/userRepository.ts';

/** Admin-only: the workers that can be assigned to a request (public-safe fields). */
export function listWorkers(principal: Principal): WorkerSummary[] {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may list workers', 403);
  }
  return listUsersByRole('worker').map((worker) => ({
    id: worker.id,
    email: worker.email,
    displayName: worker.displayName,
    ...(worker.phone !== undefined ? { phone: worker.phone } : {}),
  }));
}

/** Available to any authenticated user: a single worker's public summary. */
export function getWorkerById(id: string): WorkerSummary {
  const user = findUserById(id);
  if (!user || user.role !== 'worker') {
    throw new AppError('Worker not found', 404);
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    ...(user.phone !== undefined ? { phone: user.phone } : {}),
  };
}
