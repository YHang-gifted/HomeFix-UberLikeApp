import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresServiceRequestRepository } from '../server/src/repositories/postgresServiceRequestRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

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
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresServiceRequestRepository(queryable);
    await runMigrations(queryable);
    // service_requests.customer_id / worker_id are FK → users(id) (migration
    // 0018), so the referenced users must exist before saving a request.
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'customer@homefix.test', 'customer', 'Demo Customer', 'h'),
              ($2, 'worker@homefix.test', 'worker', 'Demo Worker', 'h')`,
      [CUSTOMER_ID, WORKER_ID],
    );
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
    assert.deepEqual(found?.photoUrls, []);
  });

  it('round-trips photo URLs through the jsonb column', async () => {
    const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    await repo.save(makeRequest({ photoUrls: urls }));
    const found = await repo.findById(REQUEST_ID);
    assert.deepEqual(found?.photoUrls, urls);
  });

  it('round-trips an optional scheduledAt and omits it when absent', async () => {
    await repo.save(makeRequest({ scheduledAt: '2026-07-01T09:00:00.000Z' }));
    const found = await repo.findById(REQUEST_ID);
    assert.equal(found?.scheduledAt, '2026-07-01T09:00:00.000Z');

    await repo.save(makeRequest({ id: '323e4567-e89b-12d3-a456-426614174999' }));
    const noSchedule = await repo.findById('323e4567-e89b-12d3-a456-426614174999');
    assert.equal(noSchedule?.scheduledAt, undefined);
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
