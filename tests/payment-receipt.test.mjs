import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetPayments } from '../server/src/services/paymentService.ts';
import { resetQuotes } from '../server/src/services/quoteService.ts';

// The three seeded demo users (customer/worker/admin) exist by default outside prod.
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const STRANGER_ID = '523e4567-e89b-12d3-a456-426614174999';
const QUOTE_CENTS = 150000;
const EXPECTED_WORKER_NET_CENTS = QUOTE_CENTS - 22500; // 15% fee floored.

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /service-requests/:id/payment/receipt', () => {
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
    await resetPayments();
    await resetQuotes();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  /** Drive a request to a created (pending) payment; return its ids. */
  async function pendingPayment() {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'Leaking kitchen sink',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    await api(ADMIN_ID, 'admin', 'PATCH', `/service-requests/${request.id}/assignment`, {
      workerId: WORKER_ID,
    });
    await api(WORKER_ID, 'worker', 'POST', `/service-requests/${request.id}/quote`, {
      amountCents: QUOTE_CENTS,
    });
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/quote/accept`);
    const payment = await (
      await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${request.id}/payment`, {
        amountCents: QUOTE_CENTS,
      })
    ).json();
    return { requestId: request.id, paymentId: payment.id };
  }

  async function paidPayment() {
    const ids = await pendingPayment();
    await api(CUSTOMER_ID, 'customer', 'POST', `/service-requests/${ids.requestId}/payment/pay`);
    return ids;
  }

  it('returns a receipt for a paid payment with the amount breakdown and parties', async () => {
    const { requestId, paymentId } = await paidPayment();

    const res = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/payment/receipt`,
    );
    assert.equal(res.status, 200);
    const receipt = await res.json();

    assert.equal(receipt.paymentId, paymentId);
    assert.equal(receipt.requestId, requestId);
    assert.equal(receipt.amountCents, QUOTE_CENTS);
    assert.equal(receipt.workerNetCents, EXPECTED_WORKER_NET_CENTS);
    assert.equal(receipt.platformFeeCents, 22500);
    assert.equal(receipt.currency, 'USD');
    assert.equal(receipt.category, 'plumbing');
    assert.match(receipt.receiptNumber, /^HF-\d{8}-[0-9A-F]{8}$/);
    assert.equal(typeof receipt.customerName, 'string');
    assert.equal(typeof receipt.workerName, 'string');
    // Deterministic: the same payment yields the same receipt number.
    const again = await (
      await api(WORKER_ID, 'worker', 'GET', `/service-requests/${requestId}/payment/receipt`)
    ).json();
    assert.equal(again.receiptNumber, receipt.receiptNumber);
  });

  it('is visible to the worker and an admin (request parties)', async () => {
    const { requestId } = await paidPayment();
    assert.equal(
      (await api(WORKER_ID, 'worker', 'GET', `/service-requests/${requestId}/payment/receipt`))
        .status,
      200,
    );
    assert.equal(
      (await api(ADMIN_ID, 'admin', 'GET', `/service-requests/${requestId}/payment/receipt`))
        .status,
      200,
    );
  });

  it('is 409 before the payment is paid', async () => {
    const { requestId } = await pendingPayment();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/payment/receipt`,
    );
    assert.equal(res.status, 409);
  });

  it('forbids a non-party (403)', async () => {
    const { requestId } = await paidPayment();
    const res = await api(
      STRANGER_ID,
      'customer',
      'GET',
      `/service-requests/${requestId}/payment/receipt`,
    );
    assert.equal(res.status, 403);
  });

  it('is 404 for a request that has no payment', async () => {
    const request = await (
      await api(CUSTOMER_ID, 'customer', 'POST', '/service-requests', {
        customerId: CUSTOMER_ID,
        category: 'plumbing',
        description: 'No payment here',
        location: { latitude: 25.03, longitude: 121.56 },
      })
    ).json();
    const res = await api(
      CUSTOMER_ID,
      'customer',
      'GET',
      `/service-requests/${request.id}/payment/receipt`,
    );
    assert.equal(res.status, 404);
  });
});
