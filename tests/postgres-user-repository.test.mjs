import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresUserRepository } from '../server/src/repositories/postgresUserRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';
import { seedDemoUsers } from '../server/src/db/seedUsers.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

describe('PostgresUserRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresUserRepository(queryable);
    await runMigrations(queryable);
    await seedDemoUsers(queryable);
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Re-seed (idempotent) and reset the customer's profile mutated by other tests.
    await seedDemoUsers({ query: (text, params) => db.query(text, params) });
    await db.query('UPDATE users SET display_name = $2, phone = NULL WHERE id = $1', [
      CUSTOMER_ID,
      'Demo Customer',
    ]);
  });

  it('finds a seeded user by email (case-insensitive)', async () => {
    const user = await repo.findByEmail('CUSTOMER@homefix.test');
    assert.equal(user?.id, CUSTOMER_ID);
    assert.equal(user?.role, 'customer');
    assert.equal(user?.displayName, 'Demo Customer');
    assert.ok(typeof user?.passwordHash === 'string' && user.passwordHash.length > 0);
  });

  it('finds a user by id and lists by role', async () => {
    const worker = await repo.findById(WORKER_ID);
    assert.equal(worker?.role, 'worker');
    const workers = await repo.listByRole('worker');
    assert.equal(workers.length, 1);
    assert.equal(workers[0].id, WORKER_ID);
  });

  it('updates display name and phone, and clears phone when omitted', async () => {
    const updated = await repo.updateProfile(CUSTOMER_ID, {
      displayName: 'Renamed',
      phone: '+1 555 010 2030',
    });
    assert.equal(updated?.displayName, 'Renamed');
    assert.equal(updated?.phone, '+1 555 010 2030');

    const persisted = await repo.findById(CUSTOMER_ID);
    assert.equal(persisted?.phone, '+1 555 010 2030');

    const cleared = await repo.updateProfile(CUSTOMER_ID, { displayName: 'Renamed' });
    assert.equal(cleared?.phone, undefined);
  });

  it('round-trips bio and skills through jsonb, and clears them when omitted', async () => {
    const updated = await repo.updateProfile(WORKER_ID, {
      displayName: 'Demo Worker',
      bio: 'Master electrician.',
      skills: ['electrical', 'plumbing'],
    });
    assert.equal(updated?.bio, 'Master electrician.');
    assert.deepEqual(updated?.skills, ['electrical', 'plumbing']);

    const persisted = await repo.findById(WORKER_ID);
    assert.equal(persisted?.bio, 'Master electrician.');
    assert.deepEqual(persisted?.skills, ['electrical', 'plumbing']);

    const cleared = await repo.updateProfile(WORKER_ID, { displayName: 'Demo Worker' });
    assert.equal(cleared?.bio, undefined);
    assert.equal(cleared?.skills, undefined);
  });

  it('returns undefined for an unknown email or id', async () => {
    assert.equal(await repo.findByEmail('nobody@homefix.test'), undefined);
    assert.equal(await repo.findById('999e4567-e89b-12d3-a456-426614174000'), undefined);
  });

  it('seedDemoUsers is idempotent (no duplicate rows)', async () => {
    await seedDemoUsers({ query: (text, params) => db.query(text, params) });
    const result = await db.query('SELECT count(*)::int AS n FROM users');
    assert.equal(result.rows[0].n, 3);
  });
});
