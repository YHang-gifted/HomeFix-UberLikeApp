import type { Principal, PublicUser } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { favoriteRepository } from '../repositories/favoriteRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, displayName: user.displayName, role: user.role };
}

function requireCustomer(principal: Principal): void {
  if (principal.role !== 'customer') {
    throw new AppError('Only a customer can manage favorite workers', 403);
  }
}

/** The customer's favorited workers as public summaries, sorted by display name. */
export async function listFavorites(principal: Principal): Promise<PublicUser[]> {
  requireCustomer(principal);
  const workerIds = await favoriteRepository.listWorkerIds(principal.id);
  const workers = await Promise.all(workerIds.map((id) => userRepository.findById(id)));
  return workers
    .filter((user): user is UserRecord => user !== undefined)
    .map((user) => toPublicUser(user))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Favorite a worker (idempotent). 404 if the id is not an existing worker. */
export async function addFavorite(principal: Principal, workerId: string): Promise<PublicUser[]> {
  requireCustomer(principal);
  const worker = await userRepository.findById(workerId);
  if (!worker || worker.role !== 'worker') {
    throw new AppError('Worker not found', 404);
  }
  await favoriteRepository.add(principal.id, workerId);
  return listFavorites(principal);
}

/** Unfavorite a worker (idempotent — removing a non-favorite is a no-op). */
export async function removeFavorite(
  principal: Principal,
  workerId: string,
): Promise<PublicUser[]> {
  requireCustomer(principal);
  await favoriteRepository.remove(principal.id, workerId);
  return listFavorites(principal);
}

export async function resetFavorites(): Promise<void> {
  await favoriteRepository.clear();
}
