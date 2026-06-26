import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PGlite } from '@electric-sql/pglite';

import { PostgresFavoriteRepository } from '../server/src/repositories/postgresFavoriteRepository.ts';
import { runMigrations } from '../server/src/db/migrate.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_CUSTOMER = '223e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_WORKER = '523e4567-e89b-12d3-a456-426614174000';

describe('PostgresFavoriteRepository (PGlite)', () => {
  let db;
  let repo;

  before(async () => {
    db = new PGlite();
    const queryable = { query: (text, params) => db.query(text, params) };
    repo = new PostgresFavoriteRepository(queryable);
    await runMigrations(queryable);
  });

  after(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  it('adds and lists a customer’s favorite workers', async () => {
    await repo.add(CUSTOMER_ID, WORKER_ID);
    await repo.add(CUSTOMER_ID, OTHER_WORKER);
    const ids = await repo.listWorkerIds(CUSTOMER_ID);
    assert.deepEqual([...ids].sort(), [WORKER_ID, OTHER_WORKER].sort());
  });

  it('add is idempotent (composite primary key, ON CONFLICT DO NOTHING)', async () => {
    await repo.add(CUSTOMER_ID, WORKER_ID);
    await repo.add(CUSTOMER_ID, WORKER_ID);
    assert.deepEqual(await repo.listWorkerIds(CUSTOMER_ID), [WORKER_ID]);
  });

  it('remove deletes only that pair and is idempotent', async () => {
    await repo.add(CUSTOMER_ID, WORKER_ID);
    await repo.add(CUSTOMER_ID, OTHER_WORKER);
    await repo.remove(CUSTOMER_ID, WORKER_ID);
    assert.deepEqual(await repo.listWorkerIds(CUSTOMER_ID), [OTHER_WORKER]);
    await repo.remove(CUSTOMER_ID, WORKER_ID);
    assert.deepEqual(await repo.listWorkerIds(CUSTOMER_ID), [OTHER_WORKER]);
  });

  it('favorites are scoped per customer', async () => {
    await repo.add(CUSTOMER_ID, WORKER_ID);
    assert.deepEqual(await repo.listWorkerIds(OTHER_CUSTOMER), []);
  });

  it('clear empties the table', async () => {
    await repo.add(CUSTOMER_ID, WORKER_ID);
    await repo.clear();
    assert.deepEqual(await repo.listWorkerIds(CUSTOMER_ID), []);
  });
});
