import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetNotifications } from '../server/src/services/notificationService.ts';

const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

describe('ApiClient.getPaymentReceipt (against in-process server)', () => {
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
    await resetPayments();
    await resetNotifications();
  });

  it('fetches and parses the receipt for a paid payment', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const principal = customer.getPrincipal();

    const request = await customer.createServiceRequest({
      customerId: principal.id,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });

    await fetch(`${baseUrl}/service-requests/${request.id}/assignment`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${signToken({ id: ADMIN_ID, role: 'admin' })}`,
      },
      body: JSON.stringify({ workerId: WORKER_ID }),
    });

    const worker = new ApiClient(baseUrl);
    await worker.login('worker@homefix.test', 'worker-pass');
    await worker.createQuote(request.id, { amountCents: 150000 });
    await customer.acceptQuote(request.id);

    const payment = await customer.createPayment(request.id, 150000);
    await customer.payPayment(request.id);

    const receipt = await customer.getPaymentReceipt(request.id);
    assert.equal(receipt.paymentId, payment.id);
    assert.equal(receipt.requestId, request.id);
    assert.equal(receipt.amountCents, 150000);
    assert.equal(receipt.currency, 'TWD');
    assert.match(receipt.receiptNumber, /^HF-\d{8}-[0-9A-F]{8}$/);
  });
});
