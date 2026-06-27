import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function validRequest(customerId) {
  return {
    customerId,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
  };
}

describe('ApiClient quote methods (against in-process server)', () => {
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
    await resetQuotes();
    await resetNotifications();
  });

  it('proposes, reads, and accepts a quote across worker and customer clients', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const principal = customer.getPrincipal();
    const created = await customer.createServiceRequest(validRequest(principal.id));

    // Admin assigns the demo worker.
    await fetch(`${baseUrl}/service-requests/${created.id}/assignment`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${signToken({ id: ADMIN_ID, role: 'admin' })}`,
      },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });

    const worker = new ApiClient(baseUrl);
    await worker.login('worker@homefix.test', 'worker-pass');
    const proposed = await worker.createQuote(created.id, {
      amountCents: 250000,
      note: 'Parts and labor',
    });
    assert.equal(proposed.status, 'pending');
    assert.equal(proposed.amountCents, 250000);

    const fetched = await customer.getQuote(created.id);
    assert.equal(fetched.id, proposed.id);

    const accepted = await customer.acceptQuote(created.id);
    assert.equal(accepted.status, 'accepted');
  });

  it('declines a quote', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const principal = customer.getPrincipal();
    const created = await customer.createServiceRequest(validRequest(principal.id));
    await fetch(`${baseUrl}/service-requests/${created.id}/assignment`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${signToken({ id: ADMIN_ID, role: 'admin' })}`,
      },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });
    const worker = new ApiClient(baseUrl);
    await worker.login('worker@homefix.test', 'worker-pass');
    await worker.createQuote(created.id, { amountCents: 100000 });

    const declined = await customer.declineQuote(created.id);
    assert.equal(declined.status, 'declined');
  });
});
