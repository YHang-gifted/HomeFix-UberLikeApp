import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresPaymentRepository } from '../server/src/repositories/postgresPaymentRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OTHER_REQUEST = '523e4567-e89b-12d3-a456-426614174111';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makePayment(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 150000,
    currency: 'TWD',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresPaymentRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresPaymentRepository(queryable);
    await runMigrations(queryable);
    // payments FK → users(id) + service_requests(id) (migration 0019): seed all
    // referenced parents — two customers, two workers, and the five requests the
    // tests below use.
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'c1@homefix.test', 'customer', 'C1', 'h'),
              ($2, 'c2@homefix.test', 'customer', 'C2', 'h'),
              ($3, 'w1@homefix.test', 'worker', 'W1', 'h'),
              ($4, 'w2@homefix.test', 'worker', 'W2', 'h')`,
      [CUSTOMER_ID, OTHER_CUSTOMER_ID, WORKER_ID, '423e4567-e89b-12d3-a456-426614174999'],
    );
    await queryable.query(
      `INSERT INTO service_requests
         (id, customer_id, category, description, latitude, longitude, status, created_at)
       VALUES ($1, $6, 'plumbing', 'x', 25, 121, 'pending', $7),
              ($2, $6, 'plumbing', 'x', 25, 121, 'pending', $7),
              ($3, $6, 'plumbing', 'x', 25, 121, 'pending', $7),
              ($4, $6, 'plumbing', 'x', 25, 121, 'pending', $7),
              ($5, $6, 'plumbing', 'x', 25, 121, 'pending', $7)`,
      [
        REQUEST_ID,
        OTHER_REQUEST,
        '523e4567-e89b-12d3-a456-426614174222',
        '523e4567-e89b-12d3-a456-426614174333',
        '523e4567-e89b-12d3-a456-426614174444',
        CUSTOMER_ID,
        '2026-06-22T00:00:00.000Z',
      ],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a pending payment and finds it by request', async () => {
    await repo.save(makePayment());
    const found = await repo.findByRequest(REQUEST_ID);
    assert.equal(found?.amountCents, 150000);
    assert.equal(found?.currency, 'TWD');
    assert.equal(found?.status, 'pending');
    assert.equal(found?.paidAt, undefined);
  });

  it('persists the platform fee and derives the worker net', async () => {
    await repo.save(makePayment({ amountCents: 150000, platformFeeCents: 22500 }));
    const found = await repo.findByRequest(REQUEST_ID);
    assert.equal(found?.platformFeeCents, 22500);
    assert.equal(found?.workerNetCents, 127500);
  });

  it('upserts the same payment to paid (status + paidAt) by id', async () => {
    await repo.save(makePayment());
    await repo.save(makePayment({ status: 'paid', paidAt: '2026-06-22T01:00:00.000Z' }));
    const found = await repo.findByRequest(REQUEST_ID);
    assert.equal(found?.status, 'paid');
    assert.equal(found?.paidAt, '2026-06-22T01:00:00.000Z');
  });

  it('scopes payments to their request', async () => {
    await repo.save(makePayment());
    assert.equal(await repo.findByRequest(OTHER_REQUEST), undefined);
  });

  it('lists a customer payments most-recent-first, scoped to that customer', async () => {
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174001',
        requestId: REQUEST_ID,
        createdAt: '2026-06-22T00:00:00.000Z',
      }),
    );
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174002',
        requestId: OTHER_REQUEST,
        createdAt: '2026-06-23T00:00:00.000Z',
      }),
    );
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174003',
        requestId: '523e4567-e89b-12d3-a456-426614174222',
        customerId: OTHER_CUSTOMER_ID,
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    );

    const mine = await repo.findByCustomer(CUSTOMER_ID);
    assert.equal(mine.length, 2);
    assert.equal(mine[0].createdAt, '2026-06-23T00:00:00.000Z');
    assert.equal(mine[1].createdAt, '2026-06-22T00:00:00.000Z');
    assert.deepEqual(await repo.findByCustomer('023e4567-e89b-12d3-a456-426614174000'), []);
  });

  it('lists a worker received payments most-recent-first, scoped to that worker', async () => {
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174011',
        requestId: REQUEST_ID,
        createdAt: '2026-06-22T00:00:00.000Z',
      }),
    );
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174012',
        requestId: OTHER_REQUEST,
        createdAt: '2026-06-23T00:00:00.000Z',
      }),
    );
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174013',
        requestId: '523e4567-e89b-12d3-a456-426614174333',
        workerId: '423e4567-e89b-12d3-a456-426614174999',
        createdAt: '2026-06-24T00:00:00.000Z',
      }),
    );

    const received = await repo.findByWorker(WORKER_ID);
    assert.equal(received.length, 2);
    assert.equal(received[0].createdAt, '2026-06-23T00:00:00.000Z');
    assert.equal(received[1].createdAt, '2026-06-22T00:00:00.000Z');
    assert.deepEqual(await repo.findByWorker('023e4567-e89b-12d3-a456-426614174000'), []);
  });

  it('paidTotals counts and sums only paid payments', async () => {
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174021',
        status: 'paid',
        amountCents: 150000,
      }),
    );
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174022',
        requestId: OTHER_REQUEST,
        status: 'paid',
        amountCents: 50000,
      }),
    );
    await repo.save(
      makePayment({
        id: '623e4567-e89b-12d3-a456-426614174023',
        requestId: '523e4567-e89b-12d3-a456-426614174444',
        status: 'pending',
        amountCents: 99999,
      }),
    );

    const totals = await repo.paidTotals();
    assert.equal(totals.count, 2);
    assert.equal(totals.amountCents, 200000);
  });

  it('paidTotals is zero when there are no paid payments', async () => {
    const totals = await repo.paidTotals();
    assert.deepEqual(totals, { count: 0, amountCents: 0 });
  });

  it('deleteByRequest removes only that request’s payment', async () => {
    await repo.save(makePayment());
    await repo.save(
      makePayment({ id: '623e4567-e89b-12d3-a456-426614174099', requestId: OTHER_REQUEST }),
    );
    await repo.deleteByRequest(REQUEST_ID);
    assert.equal(await repo.findByRequest(REQUEST_ID), undefined);
    assert.notEqual(await repo.findByRequest(OTHER_REQUEST), undefined);
    // Idempotent: deleting again is a no-op.
    await repo.deleteByRequest(REQUEST_ID);
  });

  it('clear empties the table', async () => {
    await repo.save(makePayment());
    await repo.clear();
    assert.equal(await repo.findByRequest(REQUEST_ID), undefined);
  });
});
