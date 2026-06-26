import process from 'node:process';

import pg from 'pg';

import type { Queryable } from '../db/queryable.ts';

export function createPoolQueryable(connectionString: string): Queryable {
  const pool = new pg.Pool({ connectionString });
  return {
    query: (text, params) => pool.query(text, params),
  };
}

let sharedQueryable: Queryable | undefined;
let resolved = false;

/**
 * The process-wide pooled queryable built from `DATABASE_URL`, or `undefined`
 * when no database is configured (in-memory mode). Memoized so callers such as
 * the readiness probe reuse a single pool instead of opening a connection per
 * request.
 */
export function getDatabaseQueryable(): Queryable | undefined {
  if (!resolved) {
    const url = process.env['DATABASE_URL'];
    sharedQueryable = url !== undefined && url !== '' ? createPoolQueryable(url) : undefined;
    resolved = true;
  }
  return sharedQueryable;
}
