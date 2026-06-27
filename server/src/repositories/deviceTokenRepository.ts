import process from 'node:process';

import { createPoolQueryable } from '../config/db.ts';
import { PostgresDeviceTokenRepository } from './postgresDeviceTokenRepository.ts';

/** A user's set of registered device push tokens. Membership is unique per (user, token). */
export interface DeviceTokenRepository {
  add(userId: string, token: string): Promise<void>;
  listTokens(userId: string): Promise<string[]>;
  clear(): Promise<void>;
}

export class InMemoryDeviceTokenRepository implements DeviceTokenRepository {
  private readonly byUser = new Map<string, Set<string>>();

  public add(userId: string, token: string): Promise<void> {
    const set = this.byUser.get(userId) ?? new Set<string>();
    set.add(token);
    this.byUser.set(userId, set);
    return Promise.resolve();
  }

  public listTokens(userId: string): Promise<string[]> {
    return Promise.resolve([...(this.byUser.get(userId) ?? [])]);
  }

  public clear(): Promise<void> {
    this.byUser.clear();
    return Promise.resolve();
  }
}

export function selectDeviceTokenRepository(
  databaseUrl: string | undefined,
): DeviceTokenRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresDeviceTokenRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryDeviceTokenRepository();
}

export const deviceTokenRepository: DeviceTokenRepository = selectDeviceTokenRepository(
  process.env['DATABASE_URL'],
);
