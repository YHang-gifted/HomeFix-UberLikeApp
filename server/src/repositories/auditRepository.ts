import process from 'node:process';

import type { AuditEvent } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresAuditRepository } from './postgresAuditRepository.ts';

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  findAll(): Promise<AuditEvent[]>;
  clear(): Promise<void>;
}

export class InMemoryAuditRepository implements AuditRepository {
  private readonly events: AuditEvent[] = [];

  public append(event: AuditEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  public findAll(): Promise<AuditEvent[]> {
    return Promise.resolve([...this.events]);
  }

  public clear(): Promise<void> {
    this.events.length = 0;
    return Promise.resolve();
  }
}

export function selectAuditRepository(databaseUrl: string | undefined): AuditRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresAuditRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryAuditRepository();
}

export const auditRepository: AuditRepository = selectAuditRepository(process.env['DATABASE_URL']);
