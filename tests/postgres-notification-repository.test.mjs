import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresNotificationRepository } from '../server/src/repositories/postgresNotificationRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';

function makeNotification(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    userId: USER_ID,
    message: 'Your request was assigned',
    requestId: REQUEST_ID,
    read: false,
    createdAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresNotificationRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresNotificationRepository(queryable);
    await runMigrations(queryable);
    // notifications FK → users(id) + service_requests(id) (migration 0020): seed
    // both users and the request the notifications reference (request_id is
    // nullable, so the null cases need no parent).
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'user@homefix.test', 'customer', 'Demo User', 'h'),
              ($2, 'other@homefix.test', 'worker', 'Other User', 'h')`,
      [USER_ID, OTHER_USER_ID],
    );
    await queryable.query(
      `INSERT INTO service_requests
         (id, customer_id, category, description, latitude, longitude, status, created_at)
       VALUES ($1, $2, 'plumbing', 'x', 25, 121, 'pending', $3)`,
      [REQUEST_ID, USER_ID, '2026-06-24T00:00:00.000Z'],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a notification and finds it by user id', async () => {
    await repo.save(makeNotification());
    const list = await repo.findByUser(USER_ID);
    assert.equal(list.length, 1);
    assert.equal(list[0].message, 'Your request was assigned');
    assert.equal(list[0].requestId, REQUEST_ID);
    assert.equal(list[0].read, false);
  });

  it('handles a missing requestId (null) as optional', async () => {
    await repo.save(
      makeNotification({ id: '723e4567-e89b-12d3-a456-426614174000', requestId: undefined }),
    );
    const list = await repo.findByUser(USER_ID);
    assert.equal(list.length, 1);
    assert.equal(list[0].requestId, undefined);
  });

  it('marks a notification read for its owner', async () => {
    await repo.save(makeNotification());
    const updated = await repo.markRead('623e4567-e89b-12d3-a456-426614174000', USER_ID);
    assert.equal(updated?.read, true);
    const list = await repo.findByUser(USER_ID);
    assert.equal(list[0].read, true);
  });

  it('does not mark read for a non-owner', async () => {
    await repo.save(makeNotification());
    const updated = await repo.markRead('623e4567-e89b-12d3-a456-426614174000', OTHER_USER_ID);
    assert.equal(updated, undefined);
    const list = await repo.findByUser(USER_ID);
    assert.equal(list[0].read, false);
  });

  it('scopes findByUser to the given user', async () => {
    await repo.save(makeNotification());
    assert.deepEqual(await repo.findByUser(OTHER_USER_ID), []);
  });

  it('markAllRead marks every unread notification for the user and returns the count', async () => {
    await repo.save(makeNotification());
    await repo.save(
      makeNotification({ id: '723e4567-e89b-12d3-a456-426614174000', requestId: undefined }),
    );
    await repo.save(
      makeNotification({ id: '823e4567-e89b-12d3-a456-426614174000', userId: OTHER_USER_ID }),
    );

    const changed = await repo.markAllRead(USER_ID);
    assert.equal(changed, 2);

    const list = await repo.findByUser(USER_ID);
    assert.ok(list.every((item) => item.read === true));
    const other = await repo.findByUser(OTHER_USER_ID);
    assert.equal(other[0].read, false);

    // Idempotent: a second call changes nothing.
    assert.equal(await repo.markAllRead(USER_ID), 0);
  });

  it('clear() empties the table', async () => {
    await repo.save(makeNotification());
    await repo.clear();
    assert.deepEqual(await repo.findByUser(USER_ID), []);
  });
});
