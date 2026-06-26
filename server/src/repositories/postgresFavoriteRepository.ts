import type { FavoriteRepository } from './favoriteRepository.ts';
import type { Queryable } from '../db/queryable.ts';

interface WorkerIdRow {
  worker_id: string;
}

export class PostgresFavoriteRepository implements FavoriteRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async add(customerId: string, workerId: string): Promise<void> {
    await this.db.query(
      'INSERT INTO favorites (customer_id, worker_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [customerId, workerId],
    );
  }

  public async remove(customerId: string, workerId: string): Promise<void> {
    await this.db.query('DELETE FROM favorites WHERE customer_id = $1 AND worker_id = $2', [
      customerId,
      workerId,
    ]);
  }

  public async listWorkerIds(customerId: string): Promise<string[]> {
    const result = await this.db.query('SELECT worker_id FROM favorites WHERE customer_id = $1', [
      customerId,
    ]);
    return (result.rows as WorkerIdRow[]).map((row) => row.worker_id);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM favorites');
  }
}
