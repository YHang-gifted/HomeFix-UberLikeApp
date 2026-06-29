import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../server/src/db/migrate.ts';

// Locks the 0016_indexes migration: the access-path indexes that back the
// WHERE-filtered repository queries must exist after migrating.
const EXPECTED_INDEXES = [
  'idx_service_requests_customer_id',
  'idx_service_requests_worker_id',
  'idx_service_requests_status',
  'idx_payments_customer_id',
  'idx_payments_worker_id',
  'idx_payments_status',
  'idx_reviews_worker_id',
  'idx_reviews_request_id',
  'idx_notifications_user_id',
  'idx_messages_request_id',
  'idx_audit_events_resource_id',
];

describe('schema indexes (PGlite)', () => {
  it('creates the expected access-path indexes', async () => {
    const db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    await runMigrations(queryable);

    const { rows } = await queryable.query('SELECT indexname FROM pg_indexes');
    const names = new Set(rows.map((row) => row.indexname));
    for (const index of EXPECTED_INDEXES) {
      assert.ok(names.has(index), `missing index: ${index}`);
    }

    await db.close();
  });
});
