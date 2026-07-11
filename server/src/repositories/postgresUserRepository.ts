import { randomUUID } from 'node:crypto';

import type {
  AccountStatus,
  Role,
  ServiceCategory,
  UpdateProfileInput,
  WorkerAvailability,
} from '../../../shared/schemas.ts';
import {
  accountStatusSchema,
  roleSchema,
  workerAvailabilitySchema,
  workerSkillsSchema,
} from '../../../shared/schemas.ts';
import { hashPassword } from '../auth/passwords.ts';
import { deletedEmail } from './userRepository.ts';
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
  token_version: number;
  status: string;
  notify_email: boolean;
  notify_push: boolean;
  stripe_account_id: string | null;
  stripe_payouts_enabled: boolean;
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
  const status: AccountStatus = accountStatusSchema.parse(r.status);
  const skills = parseSkills(r.skills);
  const availability = parseAvailability(r.availability);
  return {
    id: r.id,
    email: r.email,
    role,
    displayName: r.display_name,
    passwordHash: r.password_hash,
    tokenVersion: r.token_version,
    status,
    notifyEmail: r.notify_email,
    notifyPush: r.notify_push,
    ...(r.phone !== null ? { phone: r.phone } : {}),
    ...(r.bio !== null ? { bio: r.bio } : {}),
    ...(skills !== undefined ? { skills } : {}),
    ...(availability !== undefined ? { availability } : {}),
    ...(r.stripe_account_id !== null ? { stripeAccountId: r.stripe_account_id } : {}),
    ...(r.stripe_payouts_enabled ? { stripePayoutsEnabled: true } : {}),
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

  public async listAll(): Promise<UserRecord[]> {
    const result = await this.db.query('SELECT * FROM users ORDER BY display_name, email');
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

  public async bumpTokenVersion(id: string): Promise<number | undefined> {
    const result = await this.db.query(
      'UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
      [id],
    );
    const row = result.rows[0] as { token_version: number } | undefined;
    return row === undefined ? undefined : row.token_version;
  }

  public async setStatus(id: string, status: AccountStatus): Promise<UserRecord | undefined> {
    const result = await this.db.query('UPDATE users SET status = $2 WHERE id = $1 RETURNING *', [
      id,
      status,
    ]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async setStripeAccountId(id: string, accountId: string): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      'UPDATE users SET stripe_account_id = $2 WHERE id = $1 RETURNING *',
      [id, accountId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async findByStripeAccountId(accountId: string): Promise<UserRecord | undefined> {
    const result = await this.db.query('SELECT * FROM users WHERE stripe_account_id = $1', [
      accountId,
    ]);
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async setStripePayoutsEnabled(
    id: string,
    enabled: boolean,
  ): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      'UPDATE users SET stripe_payouts_enabled = $2 WHERE id = $1 RETURNING *',
      [id, enabled],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async anonymize(id: string): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      `UPDATE users
          SET email = $2,
              display_name = 'Deleted account',
              phone = NULL,
              bio = NULL,
              skills = NULL,
              availability = NULL,
              password_hash = $3,
              status = 'deleted',
              stripe_account_id = NULL,
              stripe_payouts_enabled = false,
              token_version = token_version + 1
        WHERE id = $1
        RETURNING *`,
      [id, deletedEmail(id), hashPassword(randomUUID())],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async updateNotificationPreferences(
    id: string,
    prefs: { email?: boolean | undefined; push?: boolean | undefined },
  ): Promise<UserRecord | undefined> {
    const result = await this.db.query(
      `UPDATE users
          SET notify_email = COALESCE($2, notify_email),
              notify_push = COALESCE($3, notify_push)
        WHERE id = $1
        RETURNING *`,
      [id, prefs.email ?? null, prefs.push ?? null],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }
}
