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

// In-memory only for now; slice 56b adds PostgresFavoriteRepository + a
// DATABASE_URL-based selector + migration, mirroring the other domains.
export const favoriteRepository: FavoriteRepository = new InMemoryFavoriteRepository();
