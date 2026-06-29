import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresDeviceTokenRepository } from '../server/src/repositories/postgresDeviceTokenRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_USER = '223e4567-e89b-12d3-a456-426614174000';

describe('PostgresDeviceTokenRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresDeviceTokenRepository(queryable);
    await runMigrations(queryable);
    // device_tokens.user_id is a FK → users(id) (migration 0021).
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

  it("adds and lists a user's tokens", async () => {
    await repo.add(USER_ID, 'tok-a');
    await repo.add(USER_ID, 'tok-b');
    const tokens = await repo.listTokens(USER_ID);
    assert.equal(tokens.length, 2);
    assert.ok(tokens.includes('tok-a'));
    assert.ok(tokens.includes('tok-b'));
  });

  it('de-duplicates the same (user, token)', async () => {
    await repo.add(USER_ID, 'tok-a');
    await repo.add(USER_ID, 'tok-a');
    assert.deepEqual(await repo.listTokens(USER_ID), ['tok-a']);
  });

  it('scopes tokens to their user', async () => {
    await repo.add(USER_ID, 'tok-a');
    assert.deepEqual(await repo.listTokens(OTHER_USER), []);
  });

  it('clear empties the table', async () => {
    await repo.add(USER_ID, 'tok-a');
    await repo.clear();
    assert.deepEqual(await repo.listTokens(USER_ID), []);
  });
});
