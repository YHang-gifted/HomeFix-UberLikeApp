import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { InMemoryServiceRequestRepository } from '../server/src/repositories/serviceRequestRepository.ts';
import { PostgresServiceRequestRepository } from '../server/src/repositories/postgresServiceRequestRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_WORKER = '523e4567-e89b-12d3-a456-426614174999';

function makePending() {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    photoUrls: [],
  };
}

function makeAssigned(status = 'matched') {
  return { ...makePending(), status, workerId: WORKER_ID };
}

function sharedContract(makeRepo) {
  it('assigns a worker to a pending request and returns the updated row', async () => {
    const repo = await makeRepo();
    await repo.save(makePending());
    const updated = await repo.assignWorkerIfPending(REQUEST_ID, WORKER_ID);
    assert.equal(updated?.workerId, WORKER_ID);
    assert.equal(updated?.status, 'matched');
  });

  it('returns undefined when already claimed and does not overwrite the worker', async () => {
    const repo = await makeRepo();
    await repo.save(makePending());
    await repo.assignWorkerIfPending(REQUEST_ID, WORKER_ID);
    const second = await repo.assignWorkerIfPending(REQUEST_ID, OTHER_WORKER);
    assert.equal(second, undefined);
    const current = await repo.findById(REQUEST_ID);
    assert.equal(current?.workerId, WORKER_ID);
  });

  it('returns undefined for a missing request', async () => {
    const repo = await makeRepo();
    assert.equal(await repo.assignWorkerIfPending(REQUEST_ID, WORKER_ID), undefined);
  });

  it('returns undefined when the request is no longer pending', async () => {
    const repo = await makeRepo();
    await repo.save({ ...makePending(), status: 'completed' });
    assert.equal(await repo.assignWorkerIfPending(REQUEST_ID, WORKER_ID), undefined);
  });

  it('lets only one of two concurrent claims win', async () => {
    const repo = await makeRepo();
    await repo.save(makePending());
    const [a, b] = await Promise.all([
      repo.assignWorkerIfPending(REQUEST_ID, WORKER_ID),
      repo.assignWorkerIfPending(REQUEST_ID, OTHER_WORKER),
    ]);
    const winners = [a, b].filter((r) => r !== undefined);
    assert.equal(winners.length, 1);
    const current = await repo.findById(REQUEST_ID);
    assert.equal(current?.workerId, winners[0]?.workerId);
  });

  it('releases an assigned active request back to pending and clears the worker', async () => {
    const repo = await makeRepo();
    await repo.save(makeAssigned('matched'));
    const released = await repo.releaseIfAssignedWorker(REQUEST_ID, WORKER_ID);
    assert.equal(released?.status, 'pending');
    assert.equal(released?.workerId, undefined);
    const current = await repo.findById(REQUEST_ID);
    assert.equal(current?.status, 'pending');
    assert.equal(current?.workerId, undefined);
  });

  it('releases from in_progress too', async () => {
    const repo = await makeRepo();
    await repo.save(makeAssigned('in_progress'));
    const released = await repo.releaseIfAssignedWorker(REQUEST_ID, WORKER_ID);
    assert.equal(released?.status, 'pending');
  });

  it('does not release a job assigned to a different worker', async () => {
    const repo = await makeRepo();
    await repo.save(makeAssigned('matched'));
    assert.equal(await repo.releaseIfAssignedWorker(REQUEST_ID, OTHER_WORKER), undefined);
    const current = await repo.findById(REQUEST_ID);
    assert.equal(current?.workerId, WORKER_ID);
  });

  it('does not release a completed job', async () => {
    const repo = await makeRepo();
    await repo.save(makeAssigned('completed'));
    assert.equal(await repo.releaseIfAssignedWorker(REQUEST_ID, WORKER_ID), undefined);
  });

  it('returns undefined releasing a missing request', async () => {
    const repo = await makeRepo();
    assert.equal(await repo.releaseIfAssignedWorker(REQUEST_ID, WORKER_ID), undefined);
  });
}

describe('InMemoryServiceRequestRepository.assignWorkerIfPending', () => {
  sharedContract(() => Promise.resolve(new InMemoryServiceRequestRepository()));
});

describe('PostgresServiceRequestRepository.assignWorkerIfPending (PGlite)', () => {
  let db;

  before(async () => {
    db = new PGlite();
    await runMigrations({ query: (text, params) => db.query(text, params) });
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM service_requests');
  });

  sharedContract(() =>
    Promise.resolve(
      new PostgresServiceRequestRepository({ query: (text, params) => db.query(text, params) }),
    ),
  );
});
