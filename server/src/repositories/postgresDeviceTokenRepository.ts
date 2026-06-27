import type { DeviceTokenRepository } from './deviceTokenRepository.ts';
import type { Queryable } from '../db/queryable.ts';

interface TokenRow {
  token: string;
}

export class PostgresDeviceTokenRepository implements DeviceTokenRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async add(userId: string, token: string): Promise<void> {
    await this.db.query(
      'INSERT INTO device_tokens (user_id, token) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, token],
    );
  }

  public async listTokens(userId: string): Promise<string[]> {
    const result = await this.db.query(
      'SELECT token FROM device_tokens WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    return (result.rows as TokenRow[]).map((row) => row.token);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM device_tokens');
  }
}
