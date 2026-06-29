import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresAuditRepository } from '../server/src/repositories/postgresAuditRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const ACTOR_ID = '323e4567-e89b-12d3-a456-426614174000';
const RESOURCE_ID = '523e4567-e89b-12d3-a456-426614174000';

function makeEvent(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    occurredAt: '2026-06-22T00:00:00.000Z',
    actorId: ACTOR_ID,
    actorRole: 'admin',
    action: 'service_request.assigned',
    resourceId: RESOURCE_ID,
    details: { workerId: '423e4567-e89b-12d3-a456-426614174000' },
    ...overrides,
  };
}

describe('PostgresAuditRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresAuditRepository(queryable);
    await runMigrations(queryable);
    // audit_events.actor_id is a FK → users(id) (migration 0021). resource_id is
    // polymorphic and intentionally has no FK.
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'admin@homefix.test', 'admin', 'Demo Admin', 'h')`,
      [ACTOR_ID],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('appends an event and reads it back with details', async () => {
    await repo.append(makeEvent());
    const all = await repo.findAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].action, 'service_request.assigned');
    assert.equal(all[0].actorRole, 'admin');
    assert.equal(all[0].details.workerId, '423e4567-e89b-12d3-a456-426614174000');
  });

  it('stores an event without details (null) and maps it cleanly', async () => {
    await repo.append(makeEvent({ action: 'service_request.created', details: undefined }));
    const all = await repo.findAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].details, undefined);
  });

  it('clear() empties the table', async () => {
    await repo.append(makeEvent());
    await repo.clear();
    assert.deepEqual(await repo.findAll(), []);
  });
});
