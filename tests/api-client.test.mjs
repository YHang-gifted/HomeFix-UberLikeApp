import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient, ApiError } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function validRequest() {
  return {
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
  };
}

describe('ApiClient (against in-process server)', () => {
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

  it('logs in and returns a token', async () => {
    const client = new ApiClient(baseUrl);
    const token = await client.login('customer@homefix.test', 'customer-pass');
    assert.equal(typeof token, 'string');
    assert.ok(token.length > 0);
  });

  it('creates and reads back a service request after login', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');

    const created = await client.createServiceRequest(validRequest());
    assert.equal(created.status, 'pending');
    assert.equal(created.customerId, CUSTOMER_ID);

    const fetched = await client.getServiceRequest(created.id);
    assert.equal(fetched.id, created.id);
    assert.deepEqual(fetched.photoUrls, []);
  });

  it('creates a request with photo URLs and reads them back', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');
    const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];

    const created = await client.createServiceRequest({ ...validRequest(), photoUrls: urls });
    assert.deepEqual(created.photoUrls, urls);

    const fetched = await client.getServiceRequest(created.id);
    assert.deepEqual(fetched.photoUrls, urls);
  });

  it('rejects more than five photo URLs (422)', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');
    const tooMany = Array.from({ length: 6 }, (_, i) => `https://example.com/${String(i)}.jpg`);
    await assert.rejects(
      () => client.createServiceRequest({ ...validRequest(), photoUrls: tooMany }),
      (error) => error instanceof ApiError && error.status === 422,
    );
  });

  it('rejects a malformed photo URL (422)', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');
    await assert.rejects(
      () => client.createServiceRequest({ ...validRequest(), photoUrls: ['not-a-url'] }),
      (error) => error instanceof ApiError && error.status === 422,
    );
  });

  it('lists the calling customer own service requests', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');

    await client.createServiceRequest(validRequest());
    await client.createServiceRequest(validRequest());

    const page = await client.listServiceRequests();
    assert.equal(page.total, 2);
    assert.equal(page.items.length, 2);
    assert.equal(page.offset, 0);
    for (const item of page.items) {
      assert.equal(item.customerId, CUSTOMER_ID);
    }
  });

  it('paginates the service request list with limit and offset', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');

    await client.createServiceRequest(validRequest());
    await client.createServiceRequest(validRequest());
    await client.createServiceRequest(validRequest());

    const page = await client.listServiceRequests({ limit: 2, offset: 1 });
    assert.equal(page.total, 3);
    assert.equal(page.items.length, 2);
    assert.equal(page.limit, 2);
    assert.equal(page.offset, 1);
  });

  it('filters listServiceRequests by status', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');
    await client.createServiceRequest(validRequest());

    const pending = await client.listServiceRequests({ status: 'pending' });
    assert.equal(pending.total, 1);
    const completed = await client.listServiceRequests({ status: 'completed' });
    assert.equal(completed.total, 0);
  });

  it('filters listServiceRequests by a description keyword (case-insensitive)', async () => {
    const client = new ApiClient(baseUrl);
    await client.login('customer@homefix.test', 'customer-pass');
    await client.createServiceRequest(validRequest());
    await client.createServiceRequest({
      ...validRequest(),
      description: 'Broken ceiling fan in bedroom',
    });

    const sink = await client.listServiceRequests({ q: 'SINK' });
    assert.equal(sink.total, 1);
    assert.equal(sink.items[0].description, 'Leaking kitchen sink');

    const fan = await client.listServiceRequests({ q: 'fan' });
    assert.equal(fan.total, 1);

    const none = await client.listServiceRequests({ q: 'nonexistent' });
    assert.equal(none.total, 0);
  });

  it('throws ApiError(401) on a wrong password', async () => {
    const client = new ApiClient(baseUrl);
    await assert.rejects(
      () => client.login('customer@homefix.test', 'wrong-pass'),
      (error) => error instanceof ApiError && error.status === 401,
    );
  });

  it('throws ApiError(401) when calling a protected endpoint without a token', async () => {
    const client = new ApiClient(baseUrl);
    await assert.rejects(
      () => client.createServiceRequest(validRequest()),
      (error) => error instanceof ApiError && error.status === 401,
    );
  });
});
