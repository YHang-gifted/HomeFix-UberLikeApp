import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresCertificationRepository } from '../server/src/repositories/postgresCertificationRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const CERT_ID = '523e4567-e89b-12d3-a456-426614174000';

function makeCert(overrides = {}) {
  return {
    id: CERT_ID,
    workerId: WORKER_ID,
    category: 'electrical',
    title: 'Journeyman Electrician License',
    documentUrl: 'https://cdn.example.com/certs/jle.pdf',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PostgresCertificationRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresCertificationRepository(queryable);
    await runMigrations(queryable);
    await queryable.query(
      `INSERT INTO users (id, email, role, display_name, password_hash)
       VALUES ($1, 'worker@homefix.test', 'worker', 'Demo Worker', 'h'),
              ($2, 'admin@homefix.test', 'admin', 'Demo Admin', 'h')`,
      [WORKER_ID, ADMIN_ID],
    );
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('saves a pending certification and finds it by id and worker', async () => {
    await repo.save(makeCert());
    const found = await repo.findById(CERT_ID);
    assert.equal(found?.workerId, WORKER_ID);
    assert.equal(found?.category, 'electrical');
    assert.equal(found?.status, 'pending');
    assert.equal(found?.reviewedAt, undefined);

    const byWorker = await repo.findByWorker(WORKER_ID);
    assert.equal(byWorker.length, 1);
    assert.equal(byWorker[0].id, CERT_ID);
  });

  it('upserts a review (verified) and finds by status', async () => {
    await repo.save(makeCert());
    await repo.save(
      makeCert({
        status: 'verified',
        reviewedAt: '2026-07-08T00:00:00.000Z',
        reviewerId: ADMIN_ID,
      }),
    );

    const verified = await repo.findByStatus('verified');
    assert.equal(verified.length, 1);
    assert.equal(verified[0].reviewerId, ADMIN_ID);
    assert.equal(verified[0].reviewedAt, '2026-07-08T00:00:00.000Z');
    assert.equal((await repo.findByStatus('pending')).length, 0);
  });

  it('round-trips a rejection reason', async () => {
    await repo.save(
      makeCert({ status: 'rejected', reviewerId: ADMIN_ID, rejectionReason: 'Illegible scan.' }),
    );
    const found = await repo.findById(CERT_ID);
    assert.equal(found?.status, 'rejected');
    assert.equal(found?.rejectionReason, 'Illegible scan.');
  });

  it('clear() empties the table', async () => {
    await repo.save(makeCert());
    await repo.clear();
    assert.equal((await repo.findByWorker(WORKER_ID)).length, 0);
  });
});
