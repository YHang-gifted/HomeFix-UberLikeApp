import type { Principal, WorkerSummary } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { listUsersByRole } from '../repositories/userRepository.ts';

/** Admin-only: the workers that can be assigned to a request (public-safe fields). */
export function listWorkers(principal: Principal): WorkerSummary[] {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may list workers', 403);
  }
  return listUsersByRole('worker').map((worker) => ({ id: worker.id, email: worker.email }));
}
