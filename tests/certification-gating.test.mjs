import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetCertifications } from '../server/src/services/certificationService.ts';
import { seedVerifiedCertification } from './certification-fixtures.mjs';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('credential-gated matching', () => {
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
    await resetCertifications();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  async function createPlumbingRequest() {
    return (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
  }

  async function availableTotal(workerId) {
    const page = await (await api(workerId, 'worker', 'GET', '/service-requests/available')).json();
    return page.total;
  }

  function claim(workerId, id) {
    return api(workerId, 'worker', 'PATCH', `/service-requests/${id}/claim`);
  }

  it('hides jobs and blocks claim (403) for a worker with no verified certification', async () => {
    const request = await createPlumbingRequest();
    assert.equal(await availableTotal(WORKER_ID), 0);
    assert.equal((await claim(WORKER_ID, request.id)).status, 403);
  });

  it('does not unlock the category for a pending or rejected certification', async () => {
    const request = await createPlumbingRequest();

    // Pending (submitted, not yet reviewed) — still gated.
    const cert = await (
      await api(WORKER_ID, 'worker', 'POST', '/certifications', {
        category: 'plumbing',
        title: 'Journeyman Electrician License',
        documentUrl: 'https://cdn.example.com/certs/x.pdf',
      })
    ).json();
    assert.equal(await availableTotal(WORKER_ID), 0);
    assert.equal((await claim(WORKER_ID, request.id)).status, 403);

    // Rejected — still gated.
    await api(ADMIN_ID, 'admin', 'POST', `/certifications/${cert.id}/review`, {
      decision: 'reject',
      reason: 'Illegible.',
    });
    assert.equal(await availableTotal(WORKER_ID), 0);
    assert.equal((await claim(WORKER_ID, request.id)).status, 403);
  });

  it('unlocks the category for a verified certification: worker sees and can claim', async () => {
    const request = await createPlumbingRequest();
    await seedVerifiedCertification(baseUrl, WORKER_ID, 'plumbing');

    assert.equal(await availableTotal(WORKER_ID), 1);
    const res = await claim(WORKER_ID, request.id);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'matched');
  });

  it('does not let a verified certification in one category unlock another', async () => {
    const request = await createPlumbingRequest(); // plumbing
    await seedVerifiedCertification(baseUrl, WORKER_ID, 'electrical');

    assert.equal(await availableTotal(WORKER_ID), 0);
    assert.equal((await claim(WORKER_ID, request.id)).status, 403);
  });

  it('still lets an admin assign an uncertified worker (trusted override)', async () => {
    const request = await createPlumbingRequest();
    const res = await api(
      ADMIN_ID,
      'admin',
      'PATCH',
      `/service-requests/${request.id}/assignment`,
      {
        workerId: WORKER_ID,
      },
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'matched');
  });
});
