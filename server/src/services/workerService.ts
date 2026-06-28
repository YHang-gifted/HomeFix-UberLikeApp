import type { Principal, WorkerSummary } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';

function toSummary(user: UserRecord): WorkerSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    ...(user.bio !== undefined ? { bio: user.bio } : {}),
    ...(user.skills !== undefined ? { skills: user.skills } : {}),
  };
}

/** Admin-only: the workers that can be assigned to a request (public-safe fields). */
export async function listWorkers(principal: Principal): Promise<WorkerSummary[]> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may list workers', 403);
  }
  const workers = await userRepository.listByRole('worker');
  return workers.map(toSummary);
}

/** Available to any authenticated user: a single worker's public summary. */
export async function getWorkerById(id: string): Promise<WorkerSummary> {
  const user = await userRepository.findById(id);
  if (!user || user.role !== 'worker') {
    throw new AppError('Worker not found', 404);
  }
  return toSummary(user);
}
