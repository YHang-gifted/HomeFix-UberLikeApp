import type {
  Role,
  ServiceCategory,
  UpdateProfileInput,
  WorkerAvailability,
} from '../../../shared/schemas.ts';
import {
  roleSchema,
  workerAvailabilitySchema,
  workerSkillsSchema,
} from '../../../shared/schemas.ts';
import type { UserRecord, UserRepository } from './userRepository.ts';
import type { Queryable } from '../db/queryable.ts';

interface UserRow {
  id: string;
  email: string;
  role: string;
  display_name: string;
  phone: string | null;
  bio: string | null;
  skills: unknown;
  availability: string | null;
  password_hash: string;
}

function parseAvailability(value: unknown): WorkerAvailability | undefined {
  const parsed = workerAvailabilitySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseSkills(value: unknown): ServiceCategory[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = workerSkillsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function mapRow(row: unknown): UserRecord {
  const r = row as UserRow;
  const role: Role = roleSchema.parse(r.role);
  const skills = parseSkills(r.skills);
  const availability = parseAvailability(r.availability);
  return {
    id: r.id,
    email: r.email,
    role,
    displayName: r.display_name,
    passwordHash: r.password_hash,
    ...(r.phone !== null ? { phone: r.phone } : {}),
    ...(r.bio !== null ? { bio: r.bio } : {}),
    ...(skills !== undefined ? { skills } : {}),
    ...(availability !== undefined ? { availability } : {}),
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

  public async create(user: UserRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO users (id, email, role, display_name, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.email, user.role, user.displayName, user.phone ?? null, user.passwordHash],
    );
  }

  public async updateProfile(
    id: string,
    patch: UpdateProfileInput,
  ): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      `UPDATE users
          SET display_name = $2, phone = $3, bio = $4, skills = $5::jsonb, availability = $6
        WHERE id = $1
        RETURNING *`,
      [
        id,
        patch.displayName,
        patch.phone ?? null,
        patch.bio ?? null,
        patch.skills !== undefined ? JSON.stringify(patch.skills) : null,
        patch.availability ?? null,
      ],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async updatePassword(id: string, passwordHash: string): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      'UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING *',
      [id, passwordHash],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }
}
