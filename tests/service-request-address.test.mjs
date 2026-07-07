import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function headers() {
  return {
    'content-type': 'application/json',
    Authorization: `Bearer ${signToken({ id: CUSTOMER_ID, role: 'customer' })}`,
  };
}

describe('service request optional address', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await resetServiceRequests();
  });

  function create(body) {
    return fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
  }

  const base = {
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
  };

  it('stores and returns the human-readable address alongside the coordinates', async () => {
    const created = await (
      await create({ ...base, address: 'No. 7, Sec. 5, Xinyi Rd, Taipei' })
    ).json();
    assert.equal(created.address, 'No. 7, Sec. 5, Xinyi Rd, Taipei');
    // Coordinates are still the canonical value.
    assert.equal(created.location.latitude, 25.03);

    const fetched = await (
      await fetch(`${baseUrl}/service-requests/${created.id}`, { headers: headers() })
    ).json();
    assert.equal(fetched.address, 'No. 7, Sec. 5, Xinyi Rd, Taipei');
  });

  it('omits address when none is supplied (coordinate-only request)', async () => {
    const created = await (await create(base)).json();
    assert.equal(created.address, undefined);
  });

  it('rejects an empty address (422)', async () => {
    const res = await create({ ...base, address: '' });
    assert.equal(res.status, 422);
  });
});
