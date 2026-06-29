import process from 'node:process';

import { createPoolQueryable } from '../config/db.ts';
import { loadEnv } from '../config/env.ts';
import type { Env } from '../config/env.ts';
import type { Queryable } from './queryable.ts';
import type { Migration } from './migrations.ts';
import { migrations as defaultMigrations } from './migrations.ts';
import { seedDemoUsers } from './seedUsers.ts';

/**
 * Whether to seed the demo users. An explicit `SEED_DEMO_USERS` wins; otherwise
 * seed everywhere except production, so a real production deploy never creates
 * demo accounts by default.
 */
export function shouldSeedDemoUsers(env: Pick<Env, 'NODE_ENV' | 'SEED_DEMO_USERS'>): boolean {
  return env.SEED_DEMO_USERS ?? env.NODE_ENV !== 'production';
}

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

interface MigrationRow {
  id: string;
}

/**
 * Split a migration's SQL into individual statements. The runner executes them
 * one at a time because some drivers (PGlite) accept only a single statement per
 * `query()` call. Migration SQL is project-controlled and never contains a
 * semicolon inside a string literal, so a plain split is safe. Each statement
 * should be individually idempotent (use `IF NOT EXISTS`), because a multi-
 * statement migration is not wrapped in a transaction and may re-run after a
 * partial failure.
 */
function splitSqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * Apply any not-yet-applied migrations in order. Idempotent: already-applied
 * migrations are skipped. Returns the ids applied during this run.
 */
export async function runMigrations(
  db: Queryable,
  list: Migration[] = defaultMigrations,
): Promise<string[]> {
  await db.query(CREATE_MIGRATIONS_TABLE);
  const result = await db.query('SELECT id FROM schema_migrations');
  const applied = new Set((result.rows as MigrationRow[]).map((row) => row.id));

  const newlyApplied: string[] = [];
  for (const migration of list) {
    if (applied.has(migration.id)) {
      continue;
    }
    for (const statement of splitSqlStatements(migration.sql)) {
      await db.query(statement);
    }
    await db.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
    newlyApplied.push(migration.id);
  }
  return newlyApplied;
}

/** Run migrations against the configured database on startup (no-op without DATABASE_URL). */
export async function initDatabase(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') {
    return;
  }
  const db = createPoolQueryable(databaseUrl);
  await runMigrations(db);
  if (shouldSeedDemoUsers(loadEnv())) {
    await seedDemoUsers(db);
  }
}
