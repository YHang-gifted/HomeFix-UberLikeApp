import process from 'node:process';

import { createPoolQueryable } from '../config/db.ts';
import { PostgresPasswordResetRepository } from './postgresPasswordResetRepository.ts';

/** A single-use password reset token. Only the SHA-256 hash is stored. */
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface PasswordResetRepository {
  create(token: PasswordResetToken): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markUsed(id: string, usedAt: string): Promise<void>;
  clear(): Promise<void>;
}

export class InMemoryPasswordResetRepository implements PasswordResetRepository {
  private readonly tokens = new Map<string, PasswordResetToken>();

  public create(token: PasswordResetToken): Promise<void> {
    this.tokens.set(token.id, token);
    return Promise.resolve();
  }

  public findByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    return Promise.resolve(
      [...this.tokens.values()].find((token) => token.tokenHash === tokenHash),
    );
  }

  public markUsed(id: string, usedAt: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token) {
      this.tokens.set(id, { ...token, usedAt });
    }
    return Promise.resolve();
  }

  public clear(): Promise<void> {
    this.tokens.clear();
    return Promise.resolve();
  }
}

export function selectPasswordResetRepository(
  databaseUrl: string | undefined,
): PasswordResetRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresPasswordResetRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryPasswordResetRepository();
}

export const passwordResetRepository: PasswordResetRepository = selectPasswordResetRepository(
  process.env['DATABASE_URL'],
);
