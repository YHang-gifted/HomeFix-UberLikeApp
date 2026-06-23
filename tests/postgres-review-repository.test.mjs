import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresReviewRepository } from '../server/src/repositories/postgresReviewRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeReview(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    rating: 5,
    comment: 'Great work',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresReviewRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresReviewRepository(queryable);
    await runMigrations(queryable);
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a review and finds it by request id', async () => {
    await repo.save(makeReview());
    const found = await repo.findByRequestId(REQUEST_ID);
    assert.equal(found?.rating, 5);
    assert.equal(found?.comment, 'Great work');
    assert.equal(found?.workerId, WORKER_ID);
  });

  it('finds reviews by worker id and handles a missing comment (null)', async () => {
    await repo.save(makeReview({ id: '723e4567-e89b-12d3-a456-426614174000', comment: undefined }));
    const list = await repo.findByWorkerId(WORKER_ID);
    assert.equal(list.length, 1);
    assert.equal(list[0].comment, undefined);
  });

  it('returns undefined for a request with no review', async () => {
    assert.equal(await repo.findByRequestId('999e4567-e89b-12d3-a456-426614174000'), undefined);
  });

  it('clear() empties the table', async () => {
    await repo.save(makeReview());
    await repo.clear();
    assert.deepEqual(await repo.findByWorkerId(WORKER_ID), []);
  });
});
