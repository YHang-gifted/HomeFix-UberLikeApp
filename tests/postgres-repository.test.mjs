import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresServiceRequestRepository } from '../server/src/repositories/postgresServiceRequestRepository.ts';

const REQUEST_ID = '123e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '223e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeRequest(overrides = {}) {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PostgresServiceRequestRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    repo = new PostgresServiceRequestRepository({
      query: (text, params) => db.query(text, params),
    });
    await repo.initSchema();
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a request and finds it by id', async () => {
    const req = makeRequest();
    await repo.save(req);
    const found = await repo.findById(req.id);
    assert.equal(found?.id, req.id);
    assert.equal(found?.customerId, CUSTOMER_ID);
    assert.equal(found?.status, 'pending');
    assert.equal(found?.location.latitude, 25.03);
  });

  it('returns undefined for a missing id', async () => {
    assert.equal(await repo.findById('323e4567-e89b-12d3-a456-426614174000'), undefined);
  });

  it('upserts on conflicting id and maps worker assignment', async () => {
    await repo.save(makeRequest());
    await repo.save(makeRequest({ status: 'matched', workerId: WORKER_ID }));
    const all = await repo.findAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'matched');
    assert.equal(all[0].workerId, WORKER_ID);
  });

  it('clear() empties the table', async () => {
    await repo.save(makeRequest());
    await repo.clear();
    assert.equal((await repo.findAll()).length, 0);
  });
});
