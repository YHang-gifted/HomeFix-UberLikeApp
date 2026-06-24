import type { Role } from '../../../shared/schemas.ts';
import { roleSchema } from '../../../shared/schemas.ts';
import type { UserRecord, UserRepository } from './userRepository.ts';
import type { Queryable } from '../db/queryable.ts';

interface UserRow {
  id: string;
  email: string;
  role: string;
  display_name: string;
  phone: string | null;
  password_hash: string;
}

function mapRow(row: unknown): UserRecord {
  const r = row as UserRow;
  const role: Role = roleSchema.parse(r.role);
  return {
    id: r.id,
    email: r.email,
    role,
    displayName: r.display_name,
    passwordHash: r.password_hash,
    ...(r.phone !== null ? { phone: r.phone } : {}),
  };
}

export class PostgresUserRepository implements UserRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async findByEmail(email: string): Promise<UserRecord | undefined> {
    const result = await this.db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [
      email,
    ]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async listByRole(role: Role): Promise<UserRecord[]> {
    const result = await this.db.query('SELECT * FROM users WHERE role = $1', [role]);
    return result.rows.map(mapRow);
  }

  public async findById(id: string): Promise<UserRecord | undefined> {
    const result = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async updateProfile(
    id: string,
    displayName: string,
    phone: string | undefined,
  ): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      'UPDATE users SET display_name = $2, phone = $3 WHERE id = $1 RETURNING *',
      [id, displayName, phone ?? null],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }
}
