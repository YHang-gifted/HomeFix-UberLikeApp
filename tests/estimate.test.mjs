import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import {
  resetPriceEstimatorForTests,
  setPriceEstimatorForTests,
} from '../server/src/services/estimateService.ts';

// AI price estimate, slice 1: a non-binding rough range for a quote-track job, to set the
// customer's expectation before workers quote. The baseline is a per-category range; a real vision
// model plugs in behind the injectable estimator (exercised here with a fake). Fixed-price jobs
// have no estimate — their price is already set.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-12d3-a456-426614174999';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests/:id/estimate', () => {
  let server;
  let baseUrl;

  before(async () => {
    await resetServiceRequests();
    await resetQuotes();
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    resetPriceEstimatorForTests();
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    resetPriceEstimatorForTests();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function createRequest(catalogItemId) {
    const res = await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'The kitchen sink is blocked',
      location: { latitude: 25.03, longitude: 121.56 },
      ...(catalogItemId !== undefined ? { catalogItemId } : {}),
    });
    return (await res.json()).id;
  }

  function getEstimate(requestId, id = CUSTOMER_ID, role = 'customer') {
    return api(id, role, 'GET', `/service-requests/${requestId}/estimate`);
  }

  it('returns a non-binding range for a quote-track request', async () => {
    const requestId = await createRequest(undefined);
    const res = await getEstimate(requestId);
    assert.equal(res.status, 200);
    const estimate = await res.json();
    assert.ok(Number.isInteger(estimate.lowCents));
    assert.ok(Number.isInteger(estimate.highCents));
    assert.ok(estimate.lowCents <= estimate.highCents);
    assert.ok(estimate.lowCents > 0);
  });

  it('has no estimate for a fixed-price catalog job (404)', async () => {
    const requestId = await createRequest('drain-unclog');
    assert.equal((await getEstimate(requestId)).status, 404);
  });

  it('uses the injected estimator when one is set', async () => {
    setPriceEstimatorForTests(() => Promise.resolve({ lowCents: 11100, highCents: 22200 }));
    const requestId = await createRequest(undefined);
    const estimate = await (await getEstimate(requestId)).json();
    assert.equal(estimate.lowCents, 11100);
    assert.equal(estimate.highCents, 22200);
  });

  it('404s when the estimator has no view', async () => {
    setPriceEstimatorForTests(() => Promise.resolve(undefined));
    const requestId = await createRequest(undefined);
    assert.equal((await getEstimate(requestId)).status, 404);
  });

  it('is visible to the assigned worker but not to a stranger', async () => {
    const requestId = await createRequest(undefined);
    await api(
      '323e4567-e89b-12d3-a456-426614174000',
      'admin',
      'PATCH',
      `/service-requests/${requestId}/assignment`,
      { workerId: WORKER_ID },
    );
    assert.equal((await getEstimate(requestId, WORKER_ID, 'worker')).status, 200);
    assert.equal((await getEstimate(requestId, OTHER_ID, 'worker')).status, 403);
  });
});
