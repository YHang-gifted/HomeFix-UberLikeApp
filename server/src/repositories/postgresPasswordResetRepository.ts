import type { PasswordResetRepository, PasswordResetToken } from './passwordResetRepository.ts';
import type { Queryable } from '../db/queryable.ts';

interface PasswordResetRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string | Date;
  used_at: string | Date | null;
  created_at: string | Date;
}

function mapRow(row: unknown): PasswordResetToken {
  const r = row as PasswordResetRow;
  return {
    id: r.id,
    userId: r.user_id,
    tokenHash: r.token_hash,
    expiresAt: new Date(r.expires_at).toISOString(),
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.used_at !== null ? { usedAt: new Date(r.used_at).toISOString() } : {}),
  };
}

export class PostgresPasswordResetRepository implements PasswordResetRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async create(token: PasswordResetToken): Promise<void> {
    await this.db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        token.id,
        token.userId,
        token.tokenHash,
        token.expiresAt,
        token.usedAt ?? null,
        token.createdAt,
      ],
    );
  }

  public async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const result = await this.db.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async markUsed(id: string, usedAt: string): Promise<void> {
    await this.db.query('UPDATE password_reset_tokens SET used_at = $2 WHERE id = $1', [
      id,
      usedAt,
    ]);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM password_reset_tokens');
  }
}
