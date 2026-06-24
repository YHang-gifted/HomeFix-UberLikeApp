import pg from 'pg';

import type { Queryable } from '../db/queryable.ts';

export function createPoolQueryable(connectionString: string): Queryable {
  const pool = new pg.Pool({ connectionString });
  return {
    query: (text, params) => pool.query(text, params),
  };
}
