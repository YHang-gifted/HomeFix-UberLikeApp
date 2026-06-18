import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { InMemoryServiceRequestRepository } from '../server/src/repositories/serviceRequestRepository.ts';

const sample = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  customerId: '223e4567-e89b-12d3-a456-426614174000',
  category: 'plumbing',
  description: 'Leaking sink',
  location: { latitude: 0, longitude: 0 },
  status: 'pending',
  createdAt: new Date().toISOString(),
};

describe('InMemoryServiceRequestRepository', () => {
  let repo;

  beforeEach(() => {
    repo = new InMemoryServiceRequestRepository();
  });

  it('saves a request and finds it by id', () => {
    repo.save(sample);
    const found = repo.findById(sample.id);
    assert.equal(found?.id, sample.id);
  });

  it('returns undefined for a missing id', () => {
    assert.equal(repo.findById('missing'), undefined);
  });

  it('clear() empties the store', () => {
    repo.save(sample);
    repo.clear();
    assert.equal(repo.findById(sample.id), undefined);
  });
});
