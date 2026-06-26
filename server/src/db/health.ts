import type { Queryable } from './queryable.ts';

/**
 * Readiness status of the configured database.
 * - `ok`: the database answered a trivial probe query.
 * - `down`: a database is configured but the probe failed (unreachable, auth, etc.).
 * - `skipped`: no database is configured (in-memory mode); nothing to probe.
 */
export type DatabaseStatus = 'ok' | 'down' | 'skipped';

export interface ReadinessReport {
  /** True when the process can serve traffic (database is `ok` or `skipped`). */
  ready: boolean;
  database: DatabaseStatus;
}

/**
 * Probe the database with a trivial `SELECT 1`. Never throws: a failed probe is
 * reported as `down` so the caller can map it to a 503 rather than a crash.
 * `undefined` means no database is configured (in-memory mode) → `skipped`.
 */
export async function checkDatabase(db: Queryable | undefined): Promise<DatabaseStatus> {
  if (db === undefined) {
    return 'skipped';
  }
  try {
    await db.query('SELECT 1');
    return 'ok';
  } catch {
    return 'down';
  }
}

/** Build a readiness report. The process is ready unless a configured database is `down`. */
export async function checkReadiness(db: Queryable | undefined): Promise<ReadinessReport> {
  const database = await checkDatabase(db);
  return { ready: database !== 'down', database };
}
