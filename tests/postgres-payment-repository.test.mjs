import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresPaymentRepository } from '../server/src/repositories/postgresPaymentRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OTHER_REQUEST = '523e4567-e89b-12d3-a456-426614174111';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
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

  it('clear empties the table', async () => {
    await repo.save(makePayment());
    await repo.clear();
    assert.equal(await repo.findByRequest(REQUEST_ID), undefined);
  });
});
