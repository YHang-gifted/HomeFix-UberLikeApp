import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresPayoutRepository } from '../server/src/repositories/postgresPayoutRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQ1 = '523e4567-e89b-12d3-a456-426614174000';
const REQ2 = '523e4567-e89b-12d3-a456-426614174111';
const PAY1 = '623e4567-e89b-12d3-a456-426614174000';
const PAY2 = '623e4567-e89b-12d3-a456-426614174111';
const PAYOUT1 = '723e4567-e89b-12d3-a456-426614174000';
const PAYOUT2 = '723e4567-e89b-12d3-a456-426614174111';

function makePayout(overrides = {}) {
  return {
    id: PAYOUT1,
    paymentId: PAY1,
    workerId: WORKER_ID,
    amountCents: 127500,
    currency: 'USD',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresPayoutRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const q = { query: (text, params) => db.query(text, params) };
    repo = new PostgresPayoutRepository(q);
    await runMigrations(q);
    // payouts FK → payments(id) + users(id): seed the parents.
    await q.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'c@homefix.test', 'customer', 'C', 'h'),
              ($2, 'w@homefix.test', 'worker', 'W', 'h')`,
      [CUSTOMER_ID, WORKER_ID],
    );
    await q.query(
      `INSERT INTO service_requests
         (id, customer_id, category, description, latitude, longitude, status, created_at)
       VALUES ($1, $3, 'plumbing', 'x', 25, 121, 'pending', $4),
              ($2, $3, 'plumbing', 'x', 25, 121, 'pending', $4)`,
      [REQ1, REQ2, CUSTOMER_ID, '2026-06-22T00:00:00.000Z'],
    );
    await q.query(
      `INSERT INTO payments
         (id, request_id, customer_id, worker_id, amount_cents, currency, status, created_at)
       VALUES ($1, $3, $5, $6, 150000, 'USD', 'paid', $7),
              ($2, $4, $5, $6, 150000, 'USD', 'paid', $7)`,
      [PAY1, PAY2, REQ1, REQ2, CUSTOMER_ID, WORKER_ID, '2026-06-22T00:00:00.000Z'],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a pending payout and finds it by id and by payment', async () => {
    await repo.save(makePayout());
    assert.equal((await repo.findById(PAYOUT1))?.amountCents, 127500);
    assert.equal((await repo.findById(PAYOUT1))?.status, 'pending');
    assert.equal((await repo.findByPayment(PAY1))?.id, PAYOUT1);
    assert.equal(await repo.findById(PAY2), undefined);
  });

  it('upserts the same payout to paid (status + paidAt) by id', async () => {
    await repo.save(makePayout());
    await repo.save(makePayout({ status: 'paid', paidAt: '2026-06-22T02:00:00.000Z' }));
    const found = await repo.findById(PAYOUT1);
    assert.equal(found?.status, 'paid');
    assert.equal(found?.paidAt, '2026-06-22T02:00:00.000Z');
  });

  it('lists a worker payouts most-recent-first', async () => {
    await repo.save(makePayout({ createdAt: '2026-06-22T00:00:00.000Z' }));
    await repo.save(
      makePayout({ id: PAYOUT2, paymentId: PAY2, createdAt: '2026-06-23T00:00:00.000Z' }),
    );
    const list = await repo.findByWorker(WORKER_ID);
    assert.equal(list.length, 2);
    assert.equal(list[0].id, PAYOUT2);
    assert.equal(list[1].id, PAYOUT1);
  });

  it('aggregates outstanding totals by status', async () => {
    await repo.save(makePayout({ amountCents: 127500 }));
    await repo.save(
      makePayout({ id: PAYOUT2, paymentId: PAY2, amountCents: 90000, status: 'paid' }),
    );

    const totals = await repo.outstandingTotals();
    assert.deepEqual(totals, {
      pendingCount: 1,
      pendingAmountCents: 127500,
      paidCount: 1,
      paidAmountCents: 90000,
    });
  });

  it('returns zeros when there are no payouts', async () => {
    const totals = await repo.outstandingTotals();
    assert.deepEqual(totals, {
      pendingCount: 0,
      pendingAmountCents: 0,
      paidCount: 0,
      paidAmountCents: 0,
    });
  });
});
