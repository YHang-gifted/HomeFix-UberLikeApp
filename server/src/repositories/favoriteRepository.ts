import process from 'node:process';

import { createPoolQueryable } from '../config/db.ts';
import { PostgresFavoriteRepository } from './postgresFavoriteRepository.ts';

/** A customer's set of favorited workers. Membership is unique per (customer, worker). */
export interface FavoriteRepository {
  add(customerId: string, workerId: string): Promise<void>;
  remove(customerId: string, workerId: string): Promise<void>;
  listWorkerIds(customerId: string): Promise<string[]>;
  clear(): Promise<void>;
}

export class InMemoryFavoriteRepository implements FavoriteRepository {
  private readonly byCustomer = new Map<string, Set<string>>();

  public add(customerId: string, workerId: string): Promise<void> {
    const set = this.byCustomer.get(customerId) ?? new Set<string>();
    set.add(workerId);
    this.byCustomer.set(customerId, set);
    return Promise.resolve();
  }

  public remove(customerId: string, workerId: string): Promise<void> {
    this.byCustomer.get(customerId)?.delete(workerId);
    return Promise.resolve();
  }

  public listWorkerIds(customerId: string): Promise<string[]> {
    return Promise.resolve([...(this.byCustomer.get(customerId) ?? [])]);
  }

  public clear(): Promise<void> {
    this.byCustomer.clear();
    return Promise.resolve();
  }
}

export function selectFavoriteRepository(databaseUrl: string | undefined): FavoriteRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresFavoriteRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryFavoriteRepository();
}

export const favoriteRepository: FavoriteRepository = selectFavoriteRepository(
  process.env['DATABASE_URL'],
);
