import process from 'node:process';

import type {
  AccountStatus,
  Role,
  ServiceCategory,
  UpdateProfileInput,
  WorkerAvailability,
} from '../../../shared/schemas.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresUserRepository } from './postgresUserRepository.ts';

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  phone?: string;
  bio?: string;
  skills?: ServiceCategory[];
  availability?: WorkerAvailability;
  passwordHash: string;
  /** Bumped to invalidate all previously issued JWTs (logout-all, password change). */
  tokenVersion: number;
  /** Account lifecycle state. Only `active` accounts may sign in. */
  status: AccountStatus;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  listByRole(role: Role): Promise<UserRecord[]>;
  findById(id: string): Promise<UserRecord | undefined>;
  create(user: UserRecord): Promise<void>;
  /** Replace the user's editable profile fields; omitted optional fields are cleared. */
  updateProfile(id: string, patch: UpdateProfileInput): Promise<UserRecord | undefined>;
  /** Set the user's password hash. Returns the updated record, or undefined if unknown. */
  updatePassword(id: string, passwordHash: string): Promise<UserRecord | undefined>;
  /** Increment token_version (revoking all current tokens). Returns the new value. */
  bumpTokenVersion(id: string): Promise<number | undefined>;
  /** Set the account lifecycle status. Returns the updated record, or undefined if unknown. */
  setStatus(id: string, status: AccountStatus): Promise<UserRecord | undefined>;
}

/** Demo seed users for local development only. Replace with a real user store. */
export interface DemoUserSeed {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  password: string;
}

export const DEMO_USERS: readonly DemoUserSeed[] = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'customer@homefix.test',
    role: 'customer',
    displayName: 'Demo Customer',
    password: 'customer-pass',
  },
  {
    id: '323e4567-e89b-12d3-a456-426614174000',
    email: 'admin@homefix.test',
    role: 'admin',
    displayName: 'Demo Admin',
    password: 'admin-pass',
  },
  {
    id: '423e4567-e89b-12d3-a456-426614174000',
    email: 'worker@homefix.test',
    role: 'worker',
    displayName: 'Demo Worker',
    password: 'worker-pass',
  },
];

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, UserRecord>();

  public constructor() {
    for (const seed of DEMO_USERS) {
      this.users.set(seed.email.toLowerCase(), {
        id: seed.id,
        email: seed.email,
        role: seed.role,
        displayName: seed.displayName,
        passwordHash: hashPassword(seed.password),
        tokenVersion: 0,
        status: 'active',
      });
    }
  }

  public findByEmail(email: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.users.get(email.toLowerCase()));
  }

  public listByRole(role: Role): Promise<UserRecord[]> {
    return Promise.resolve([...this.users.values()].filter((user) => user.role === role));
  }

  public findById(id: string): Promise<UserRecord | undefined> {
    return Promise.resolve([...this.users.values()].find((user) => user.id === id));
  }

  public create(user: UserRecord): Promise<void> {
    this.users.set(user.email.toLowerCase(), user);
    return Promise.resolve();
  }

  public updateProfile(id: string, patch: UpdateProfileInput): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    // Rebuild the record so omitted optional fields are cleared (PATCH-as-PUT),
    // keeping only the non-editable identity fields plus what the patch provides.
    const updated: UserRecord = {
      id: user.id,
      email: user.email,
      role: user.role,
      passwordHash: user.passwordHash,
      tokenVersion: user.tokenVersion,
      status: user.status,
      displayName: patch.displayName,
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      ...(patch.availability !== undefined ? { availability: patch.availability } : {}),
    };
    this.users.set(user.email.toLowerCase(), updated);
    return Promise.resolve(updated);
  }

  public updatePassword(id: string, passwordHash: string): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = { ...user, passwordHash };
    this.users.set(user.email.toLowerCase(), updated);
    return Promise.resolve(updated);
  }

  public bumpTokenVersion(id: string): Promise<number | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = { ...user, tokenVersion: user.tokenVersion + 1 };
    this.users.set(user.email.toLowerCase(), updated);
    return Promise.resolve(updated.tokenVersion);
  }

  public setStatus(id: string, status: AccountStatus): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = { ...user, status };
    this.users.set(user.email.toLowerCase(), updated);
    return Promise.resolve(updated);
  }
}

export function selectUserRepository(databaseUrl: string | undefined): UserRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresUserRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryUserRepository();
}

export const userRepository: UserRepository = selectUserRepository(process.env['DATABASE_URL']);
