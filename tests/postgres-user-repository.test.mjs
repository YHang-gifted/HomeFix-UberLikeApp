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
    await db.query('UPDATE users SET token_version = 0');
    await db.query("UPDATE users SET status = 'active'");
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

  it('lists every user with listAll', async () => {
    const all = await repo.listAll();
    assert.ok(all.length >= 3);
    assert.ok(all.some((u) => u.id === WORKER_ID));
    assert.ok(all.some((u) => u.id === CUSTOMER_ID));
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

  it('round-trips availability and clears it when omitted', async () => {
    const updated = await repo.updateProfile(WORKER_ID, {
      displayName: 'Demo Worker',
      availability: 'away',
    });
    assert.equal(updated?.availability, 'away');

    const persisted = await repo.findById(WORKER_ID);
    assert.equal(persisted?.availability, 'away');

    const cleared = await repo.updateProfile(WORKER_ID, { displayName: 'Demo Worker' });
    assert.equal(cleared?.availability, undefined);
  });

  it('returns undefined for an unknown email or id', async () => {
    assert.equal(await repo.findByEmail('nobody@homefix.test'), undefined);
    assert.equal(await repo.findById('999e4567-e89b-12d3-a456-426614174000'), undefined);
  });

  it('updates the password hash and returns undefined for an unknown id', async () => {
    const before = await repo.findById(WORKER_ID);
    const updated = await repo.updatePassword(WORKER_ID, 'newsalt:newhash');
    assert.equal(updated?.passwordHash, 'newsalt:newhash');

    const persisted = await repo.findById(WORKER_ID);
    assert.equal(persisted?.passwordHash, 'newsalt:newhash');
    assert.notEqual(persisted?.passwordHash, before?.passwordHash);

    assert.equal(
      await repo.updatePassword('999e4567-e89b-12d3-a456-426614174000', 'x:y'),
      undefined,
    );
  });

  it('starts users at token_version 0 and bumps it, returning the new value', async () => {
    const before = await repo.findById(WORKER_ID);
    assert.equal(before?.tokenVersion, 0);

    assert.equal(await repo.bumpTokenVersion(WORKER_ID), 1);
    const after = await repo.findById(WORKER_ID);
    assert.equal(after?.tokenVersion, 1);

    assert.equal(await repo.bumpTokenVersion('999e4567-e89b-12d3-a456-426614174000'), undefined);
  });

  it('defaults seeded users to active and sets status, returning undefined for unknown id', async () => {
    const before = await repo.findById(WORKER_ID);
    assert.equal(before?.status, 'active');

    const suspended = await repo.setStatus(WORKER_ID, 'suspended');
    assert.equal(suspended?.status, 'suspended');
    const persisted = await repo.findById(WORKER_ID);
    assert.equal(persisted?.status, 'suspended');

    await repo.setStatus(WORKER_ID, 'active');
    assert.equal(
      await repo.setStatus('999e4567-e89b-12d3-a456-426614174000', 'suspended'),
      undefined,
    );
  });

  it('anonymizes an account: scrubs PII, deletes status, bumps token_version', async () => {
    const before = await repo.findById(WORKER_ID);
    const scrubbed = await repo.anonymize(WORKER_ID);
    assert.equal(scrubbed?.status, 'deleted');
    assert.equal(scrubbed?.email, `deleted+${WORKER_ID}@deleted.invalid`);
    assert.equal(scrubbed?.displayName, 'Deleted account');
    assert.equal(scrubbed?.phone, undefined);
    assert.notEqual(scrubbed?.passwordHash, before?.passwordHash);
    assert.equal(scrubbed?.tokenVersion, (before?.tokenVersion ?? 0) + 1);

    assert.equal(await repo.findByEmail('worker@homefix.test'), undefined);
    assert.equal(await repo.anonymize('999e4567-e89b-12d3-a456-426614174000'), undefined);

    // Restore the seed row so later tests see the original worker.
    await db.query(
      "UPDATE users SET email = $2, display_name = 'Demo Worker', status = 'active' WHERE id = $1",
      [WORKER_ID, 'worker@homefix.test'],
    );
  });

  it('seedDemoUsers is idempotent (no duplicate rows)', async () => {
    await seedDemoUsers({ query: (text, params) => db.query(text, params) });
    const result = await db.query('SELECT count(*)::int AS n FROM users');
    assert.equal(result.rows[0].n, 3);
  });
});
