import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresMessageRepository } from '../server/src/repositories/postgresMessageRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OTHER_REQUEST = '523e4567-e89b-12d3-a456-426614174111';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeMessage(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    requestId: REQUEST_ID,
    senderId: CUSTOMER_ID,
    senderRole: 'customer',
    body: 'Hello there',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresMessageRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresMessageRepository(queryable);
    await runMigrations(queryable);
    // messages FK → users(id) + service_requests(id) (migration 0020): seed the
    // sender users (customer + worker) and the two requests used below.
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'customer@homefix.test', 'customer', 'Demo Customer', 'h'),
              ($2, 'worker@homefix.test', 'worker', 'Demo Worker', 'h')`,
      [CUSTOMER_ID, WORKER_ID],
    );
    await queryable.query(
      `INSERT INTO service_requests
         (id, customer_id, category, description, latitude, longitude, status, created_at)
       VALUES ($1, $3, 'plumbing', 'x', 25, 121, 'matched', $4),
              ($2, $3, 'plumbing', 'x', 25, 121, 'matched', $4)`,
      [REQUEST_ID, OTHER_REQUEST, CUSTOMER_ID, '2026-06-22T00:00:00.000Z'],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves and lists a request’s messages oldest first', async () => {
    await repo.save(
      makeMessage({
        id: '623e4567-e89b-12d3-a456-426614174002',
        senderId: WORKER_ID,
        senderRole: 'worker',
        body: 'Second',
        createdAt: '2026-06-22T01:00:00.000Z',
      }),
    );
    await repo.save(makeMessage({ id: '623e4567-e89b-12d3-a456-426614174001', body: 'First' }));

    const thread = await repo.listByRequest(REQUEST_ID);
    assert.deepEqual(
      thread.map((m) => m.body),
      ['First', 'Second'],
    );
    assert.equal(thread[1].senderRole, 'worker');
  });

  it('scopes messages to their request', async () => {
    await repo.save(makeMessage());
    await repo.save(
      makeMessage({ id: '623e4567-e89b-12d3-a456-426614174003', requestId: OTHER_REQUEST }),
    );
    const thread = await repo.listByRequest(REQUEST_ID);
    assert.equal(thread.length, 1);
    assert.equal(thread[0].requestId, REQUEST_ID);
  });

  it('clear empties the table', async () => {
    await repo.save(makeMessage());
    await repo.clear();
    assert.deepEqual(await repo.listByRequest(REQUEST_ID), []);
  });
});
