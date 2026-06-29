import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresPasswordResetRepository } from '../server/src/repositories/postgresPasswordResetRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

function makeToken(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    userId: USER_ID,
    tokenHash: 'a'.repeat(64),
    expiresAt: '2026-06-28T01:00:00.000Z',
    createdAt: '2026-06-28T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostgresPasswordResetRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresPasswordResetRepository(queryable);
    await runMigrations(queryable);
    // user_id is a FK → users(id) (migration 0023).
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'user@homefix.test', 'customer', 'Demo User', 'h')`,
      [USER_ID],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('creates a token and finds it by hash', async () => {
    await repo.create(makeToken());
    const found = await repo.findByTokenHash('a'.repeat(64));
    assert.equal(found?.userId, USER_ID);
    assert.equal(found?.usedAt, undefined);
    assert.equal(found?.expiresAt, '2026-06-28T01:00:00.000Z');
  });

  it('returns undefined for an unknown hash', async () => {
    assert.equal(await repo.findByTokenHash('b'.repeat(64)), undefined);
  });

  it('marks a token used', async () => {
    await repo.create(makeToken());
    await repo.markUsed(makeToken().id, '2026-06-28T00:30:00.000Z');
    const found = await repo.findByTokenHash('a'.repeat(64));
    assert.equal(found?.usedAt, '2026-06-28T00:30:00.000Z');
  });

  it('clear empties the table', async () => {
    await repo.create(makeToken());
    await repo.clear();
    assert.equal(await repo.findByTokenHash('a'.repeat(64)), undefined);
  });
});
