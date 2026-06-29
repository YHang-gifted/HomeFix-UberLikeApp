import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresQuoteRepository } from '../server/src/repositories/postgresQuoteRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OTHER_REQUEST = '523e4567-e89b-12d3-a456-426614174111';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeQuote(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 250000,
    currency: 'TWD',
    note: 'Includes parts and labor',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresQuoteRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresQuoteRepository(queryable);
    await runMigrations(queryable);
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a pending quote (with note) and finds it by request', async () => {
    await repo.save(makeQuote());
    const found = await repo.findByRequest(REQUEST_ID);
    assert.equal(found?.amountCents, 250000);
    assert.equal(found?.currency, 'TWD');
    assert.equal(found?.note, 'Includes parts and labor');
    assert.equal(found?.status, 'pending');
    assert.equal(found?.respondedAt, undefined);
  });

  it('stores a quote without a note', async () => {
    await repo.save(makeQuote({ note: undefined }));
    const found = await repo.findByRequest(REQUEST_ID);
    assert.equal(found?.note, undefined);
  });

  it('upserts the same quote to accepted (status + respondedAt) by id', async () => {
    await repo.save(makeQuote());
    await repo.save(makeQuote({ status: 'accepted', respondedAt: '2026-06-22T01:00:00.000Z' }));
    const found = await repo.findByRequest(REQUEST_ID);
    assert.equal(found?.status, 'accepted');
    assert.equal(found?.respondedAt, '2026-06-22T01:00:00.000Z');
  });

  it('scopes quotes to their request', async () => {
    await repo.save(makeQuote());
    assert.equal(await repo.findByRequest(OTHER_REQUEST), undefined);
  });

  it('deleteByRequest removes only that request’s quote', async () => {
    await repo.save(makeQuote());
    await repo.save(
      makeQuote({ id: '623e4567-e89b-12d3-a456-426614174999', requestId: OTHER_REQUEST }),
    );
    await repo.deleteByRequest(REQUEST_ID);
    assert.equal(await repo.findByRequest(REQUEST_ID), undefined);
    assert.notEqual(await repo.findByRequest(OTHER_REQUEST), undefined);
    // Idempotent: deleting again is a no-op.
    await repo.deleteByRequest(REQUEST_ID);
  });

  it('clear empties the table', async () => {
    await repo.save(makeQuote());
    await repo.clear();
    assert.equal(await repo.findByRequest(REQUEST_ID), undefined);
  });
});
