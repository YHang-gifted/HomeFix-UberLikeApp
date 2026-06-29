import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { runMigrations } from '../server/src/db/migrate.ts';

// Locks the 0017_check_constraints migration: the DB rejects rows that violate
// the domain invariants (status/role/availability enums, rating range, positive
// amounts) and accepts valid ones.
const NOW = '2026-06-28T00:00:00.000Z';
const CUSTOMER = '223e4567-e89b-12d3-a456-426614174000';

describe('schema CHECK constraints (PGlite)', () => {
  let db;
  let q;

  before(async () => {
    db = new PGlite();
    q = { query: (text, params) => db.query(text, params) };
    await runMigrations(q);
    // service_requests.customer_id is a FK → users(id) (migration 0018), so a
    // referenced user must exist for the valid-row inserts below.
    await q.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'c@homefix.test', 'customer', 'Demo', 'h')`,
      [CUSTOMER],
    );
  });

  after(async () => {
    await db.close();
  });

  const insertRequest = (status) =>
    q.query(
      `INSERT INTO service_requests
         (id, customer_id, worker_id, category, description, latitude, longitude, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), CUSTOMER, null, 'plumbing', 'Leaky sink', 25.03, 121.56, status, NOW],
    );

  const insertUser = (role) =>
    q.query(
      `INSERT INTO users (id, email, role, display_name, password_hash) VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), `${randomUUID()}@homefix.test`, role, 'Demo', 'hash'],
    );

  const insertReview = (rating) =>
    q.query(
      `INSERT INTO reviews (id, request_id, customer_id, worker_id, rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), rating, NOW],
    );

  const insertQuote = (amountCents) =>
    q.query(
      `INSERT INTO quotes (id, request_id, customer_id, worker_id, amount_cents, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'TWD', 'pending', $6)`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), amountCents, NOW],
    );

  const insertPayment = (status) =>
    q.query(
      `INSERT INTO payments (id, request_id, customer_id, worker_id, amount_cents, currency, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'TWD', $6, $7)`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), 150000, status, NOW],
    );

  it('enforces the service_requests status enum', async () => {
    await insertRequest('matched');
    await assert.rejects(() => insertRequest('bogus'));
  });

  it('enforces the users role enum', async () => {
    await insertUser('worker');
    await assert.rejects(() => insertUser('superadmin'));
  });

  it('enforces the reviews rating range 1–5', async () => {
    await insertReview(5);
    await assert.rejects(() => insertReview(6));
    await assert.rejects(() => insertReview(0));
  });

  it('enforces a positive quote amount and the quote status enum', async () => {
    await insertQuote(1);
    await assert.rejects(() => insertQuote(0));
  });

  it('enforces the payments status enum', async () => {
    await insertPayment('paid');
    await assert.rejects(() => insertPayment('refunded'));
  });
});
