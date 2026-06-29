import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../server/src/db/migrate.ts';

// Locks the FK hardening (migration 0018+): rows referencing a non-existent
// parent are rejected; rows referencing an existing parent are accepted. The
// FKs are NOT VALID, which still enforces every new write (only existing rows
// are skipped), so these new-insert checks hold.
const NOW = '2026-06-28T00:00:00.000Z';
const CUSTOMER = '223e4567-e89b-12d3-a456-426614174000';
const WORKER = '423e4567-e89b-12d3-a456-426614174000';

function insertRequest(q, { customerId, workerId }) {
  return q.query(
    `INSERT INTO service_requests
       (id, customer_id, worker_id, category, description, latitude, longitude, status, created_at)
     VALUES ($1, $2, $3, 'plumbing', 'Leaky sink', 25.03, 121.56, 'pending', $4)`,
    [randomUUID(), customerId, workerId, NOW],
  );
}

describe('schema foreign keys (PGlite)', () => {
  let db;
  let q;

  before(async () => {
    db = new PGlite();
    q = { query: (text, params) => db.query(text, params) };
    await runMigrations(q);
    await q.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'customer@homefix.test', 'customer', 'Demo Customer', 'h'),
              ($2, 'worker@homefix.test', 'worker', 'Demo Worker', 'h')`,
      [CUSTOMER, WORKER],
    );
  });

  after(async () => {
    await db.close();
  });

  it('accepts a service_request that references existing users', async () => {
    await insertRequest(q, { customerId: CUSTOMER, workerId: WORKER });
    await insertRequest(q, { customerId: CUSTOMER, workerId: null });
  });

  it('rejects a service_request with an unknown customer_id', async () => {
    await assert.rejects(() => insertRequest(q, { customerId: randomUUID(), workerId: null }));
  });

  it('rejects a service_request with an unknown worker_id', async () => {
    await assert.rejects(() => insertRequest(q, { customerId: CUSTOMER, workerId: randomUUID() }));
  });
});
