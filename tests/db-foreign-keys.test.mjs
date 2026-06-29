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
const REQUEST = '523e4567-e89b-12d3-a456-426614174000';

function insertRequest(q, { id = randomUUID(), customerId, workerId }) {
  return q.query(
    `INSERT INTO service_requests
       (id, customer_id, worker_id, category, description, latitude, longitude, status, created_at)
     VALUES ($1, $2, $3, 'plumbing', 'Leaky sink', 25.03, 121.56, 'pending', $4)`,
    [id, customerId, workerId, NOW],
  );
}

function insertQuote(q, { requestId }) {
  return q.query(
    `INSERT INTO quotes (id, request_id, customer_id, worker_id, amount_cents, currency, status, created_at)
     VALUES ($1, $2, $3, $4, 150000, 'TWD', 'pending', $5)`,
    [randomUUID(), requestId, CUSTOMER, WORKER, NOW],
  );
}

function insertPayment(q, { requestId }) {
  return q.query(
    `INSERT INTO payments (id, request_id, customer_id, worker_id, amount_cents, currency, status, created_at)
     VALUES ($1, $2, $3, $4, 150000, 'TWD', 'pending', $5)`,
    [randomUUID(), requestId, CUSTOMER, WORKER, NOW],
  );
}

function insertReview(q, { requestId }) {
  return q.query(
    `INSERT INTO reviews (id, request_id, customer_id, worker_id, rating, created_at)
     VALUES ($1, $2, $3, $4, 5, $5)`,
    [randomUUID(), requestId, CUSTOMER, WORKER, NOW],
  );
}

function insertNotification(q, { requestId }) {
  return q.query(
    `INSERT INTO notifications (id, user_id, message, request_id, read, created_at)
     VALUES ($1, $2, 'hi', $3, false, $4)`,
    [randomUUID(), CUSTOMER, requestId, NOW],
  );
}

function insertMessage(q, { requestId }) {
  return q.query(
    `INSERT INTO messages (id, request_id, sender_id, sender_role, body, created_at)
     VALUES ($1, $2, $3, 'customer', 'hi', $4)`,
    [randomUUID(), requestId, CUSTOMER, NOW],
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
    // A valid parent request for the quote/payment FK checks below.
    await insertRequest(q, { id: REQUEST, customerId: CUSTOMER, workerId: WORKER });
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

  it('accepts a quote and payment referencing an existing request', async () => {
    await insertQuote(q, { requestId: REQUEST });
    await insertPayment(q, { requestId: REQUEST });
  });

  it('rejects a quote with an unknown request_id', async () => {
    await assert.rejects(() => insertQuote(q, { requestId: randomUUID() }));
  });

  it('rejects a payment with an unknown request_id', async () => {
    await assert.rejects(() => insertPayment(q, { requestId: randomUUID() }));
  });

  it('accepts review/notification/message referencing an existing request', async () => {
    await insertReview(q, { requestId: REQUEST });
    await insertNotification(q, { requestId: REQUEST });
    await insertNotification(q, { requestId: null }); // request_id is nullable
    await insertMessage(q, { requestId: REQUEST });
  });

  it('rejects review/notification/message with an unknown request_id', async () => {
    await assert.rejects(() => insertReview(q, { requestId: randomUUID() }));
    await assert.rejects(() => insertNotification(q, { requestId: randomUUID() }));
    await assert.rejects(() => insertMessage(q, { requestId: randomUUID() }));
  });
});
