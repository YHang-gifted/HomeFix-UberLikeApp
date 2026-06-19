import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InMemoryServiceRequestRepository,
  selectServiceRequestRepository,
} from '../server/src/repositories/serviceRequestRepository.ts';
import { PostgresServiceRequestRepository } from '../server/src/repositories/postgresServiceRequestRepository.ts';

describe('selectServiceRequestRepository', () => {
  it('uses the in-memory store when DATABASE_URL is absent', () => {
    assert.ok(
      selectServiceRequestRepository(undefined) instanceof InMemoryServiceRequestRepository,
    );
  });

  it('uses the in-memory store when DATABASE_URL is empty', () => {
    assert.ok(selectServiceRequestRepository('') instanceof InMemoryServiceRequestRepository);
  });

  it('uses Postgres when DATABASE_URL is set', () => {
    const repo = selectServiceRequestRepository('postgresql://user:pass@localhost:5432/homefix');
    assert.ok(repo instanceof PostgresServiceRequestRepository);
  });
});
