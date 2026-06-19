import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectServiceRequestRepository } from '../server/src/repositories/serviceRequestRepository.ts';

describe('selectServiceRequestRepository', () => {
  it('uses the in-memory store when DATABASE_URL is absent', () => {
    const repo = selectServiceRequestRepository(undefined);
    assert.equal(repo.constructor.name, 'InMemoryServiceRequestRepository');
  });

  it('uses the in-memory store when DATABASE_URL is empty', () => {
    const repo = selectServiceRequestRepository('');
    assert.equal(repo.constructor.name, 'InMemoryServiceRequestRepository');
  });

  it('uses Postgres when DATABASE_URL is set', () => {
    const repo = selectServiceRequestRepository('postgresql://user:pass@localhost:5432/homefix');
    assert.equal(repo.constructor.name, 'PostgresServiceRequestRepository');
  });
});
