import { randomUUID } from 'node:crypto';
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
  /** Whether the user wants email notifications (default true). */
  notifyEmail: boolean;
  /** Whether the user wants push notifications (default true). */
  notifyPush: boolean;
  /** The worker's Stripe Connect account id (`acct_…`), once they start payout onboarding. */
  stripeAccountId?: string;
  /**
   * Whether the worker's connected account can receive payouts (Stripe's
   * `payouts_enabled`), tracked from the `account.updated` webhook. Undefined/false until
   * Stripe confirms onboarding is complete; the platform only transfers once it is true.
   */
  stripePayoutsEnabled?: boolean;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  listByRole(role: Role): Promise<UserRecord[]>;
  /** All users, for admin account management. */
  listAll(): Promise<UserRecord[]>;
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
  /** Store the worker's Stripe Connect account id. Returns the updated record. */
  setStripeAccountId(id: string, accountId: string): Promise<UserRecord | undefined>;
  /** Find a worker by their Stripe Connect account id (for the account.updated webhook). */
  findByStripeAccountId(accountId: string): Promise<UserRecord | undefined>;
  /** Record whether the worker's connected account can receive payouts. */
  setStripePayoutsEnabled(id: string, enabled: boolean): Promise<UserRecord | undefined>;
  /**
   * Soft-delete: scrub the account's personal data (email, name, phone, bio,
   * skills, password), set status to `deleted`, and revoke all tokens. The row
   * is kept so foreign keys and de-identified history stay intact. Returns the
   * scrubbed record, or undefined if unknown.
   */
  anonymize(id: string): Promise<UserRecord | undefined>;
  /** Update the user's notification channel preferences (only provided channels change). */
  updateNotificationPreferences(
    id: string,
    prefs: { email?: boolean | undefined; push?: boolean | undefined },
  ): Promise<UserRecord | undefined>;
}

/** The deterministic, unique placeholder email a soft-deleted account is scrubbed to. */
export function deletedEmail(id: string): string {
  return `deleted+${id}@deleted.invalid`;
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
        notifyEmail: true,
        notifyPush: true,
      });
    }
  }

  public findByEmail(email: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.users.get(email.toLowerCase()));
  }

  public listByRole(role: Role): Promise<UserRecord[]> {
    return Promise.resolve([...this.users.values()].filter((user) => user.role === role));
  }

  public listAll(): Promise<UserRecord[]> {
    return Promise.resolve([...this.users.values()]);
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
      notifyEmail: user.notifyEmail,
      notifyPush: user.notifyPush,
      displayName: patch.displayName,
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      ...(patch.availability !== undefined ? { availability: patch.availability } : {}),
      // Payout onboarding isn't a profile field — carry it through a profile edit.
      ...(user.stripeAccountId !== undefined ? { stripeAccountId: user.stripeAccountId } : {}),
      ...(user.stripePayoutsEnabled !== undefined
        ? { stripePayoutsEnabled: user.stripePayoutsEnabled }
        : {}),
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

  public setStripeAccountId(id: string, accountId: string): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = { ...user, stripeAccountId: accountId };
    this.users.set(user.email.toLowerCase(), updated);
    return Promise.resolve(updated);
  }

  public findByStripeAccountId(accountId: string): Promise<UserRecord | undefined> {
    return Promise.resolve(
      [...this.users.values()].find((user) => user.stripeAccountId === accountId),
    );
  }

  public setStripePayoutsEnabled(id: string, enabled: boolean): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = { ...user, stripePayoutsEnabled: enabled };
    this.users.set(user.email.toLowerCase(), updated);
    return Promise.resolve(updated);
  }

  public anonymize(id: string): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const scrubbed: UserRecord = {
      id: user.id,
      role: user.role,
      email: deletedEmail(user.id),
      displayName: 'Deleted account',
      passwordHash: hashPassword(randomUUID()),
      tokenVersion: user.tokenVersion + 1,
      status: 'deleted',
      notifyEmail: false,
      notifyPush: false,
    };
    // Re-key the map: the lookup key is the email, which we are changing.
    this.users.delete(user.email.toLowerCase());
    this.users.set(scrubbed.email.toLowerCase(), scrubbed);
    return Promise.resolve(scrubbed);
  }

  public updateNotificationPreferences(
    id: string,
    prefs: { email?: boolean | undefined; push?: boolean | undefined },
  ): Promise<UserRecord | undefined> {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) {
      return Promise.resolve(undefined);
    }
    const updated: UserRecord = {
      ...user,
      notifyEmail: prefs.email ?? user.notifyEmail,
      notifyPush: prefs.push ?? user.notifyPush,
    };
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
