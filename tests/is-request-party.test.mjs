import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isRequestParty } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeRequest(overrides = {}) {
  return {
    id: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('isRequestParty', () => {
  it('treats any admin as a party', () => {
    assert.equal(isRequestParty(makeRequest(), { id: ADMIN_ID, role: 'admin' }), true);
  });

  it('treats the owning customer as a party, but not another customer', () => {
    assert.equal(isRequestParty(makeRequest(), { id: CUSTOMER_ID, role: 'customer' }), true);
    assert.equal(isRequestParty(makeRequest(), { id: OTHER_ID, role: 'customer' }), false);
  });

  it('treats the assigned worker as a party only when assigned', () => {
    const assigned = makeRequest({ workerId: WORKER_ID });
    assert.equal(isRequestParty(assigned, { id: WORKER_ID, role: 'worker' }), true);
    // no worker assigned yet
    assert.equal(isRequestParty(makeRequest(), { id: WORKER_ID, role: 'worker' }), false);
    // a different worker than the one assigned
    assert.equal(isRequestParty(assigned, { id: OTHER_ID, role: 'worker' }), false);
  });
});
