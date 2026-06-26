import process from 'node:process';

import type { Role } from '../../../shared/schemas.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresUserRepository } from './postgresUserRepository.ts';

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  phone?: string;
  passwordHash: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  listByRole(role: Role): Promise<UserRecord[]>;
  findById(id: string): Promise<UserRecord | undefined>;
  create(user: UserRecord): Promise<void>;
  updateProfile(
    id: string,
    displayName: string,
    phone: string | undefined,
  ): Promise<UserRecord | undefined>;
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

  public updateProfile(
    id: string,
    displayName: string,
    phone: string | undefined,
  ): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = { ...user, displayName };
    if (phone === undefined) {
      delete updated.phone;
    } else {
      updated.phone = phone;
    }
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
