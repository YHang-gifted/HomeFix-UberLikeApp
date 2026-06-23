import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { ApiClient } from '../app/src/services/apiClient.ts';
import { createApp } from '../server/src/app.ts';
import { resetServiceRequests } from '../server/src/services/serviceRequestService.ts';
import { resetReviews } from '../server/src/services/reviewService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

describe('ApiClient reviews (against in-process server)', () => {
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
    await resetReviews();
  });

  it('creates a review on a completed request and reads the worker rating', async () => {
    const customer = new ApiClient(baseUrl);
    await customer.login('customer@homefix.test', 'customer-pass');
    const request = await customer.createServiceRequest({
      customerId: CUSTOMER_ID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });

    const admin = new ApiClient(baseUrl);
    await admin.login('admin@homefix.test', 'admin-pass');
    await admin.assignWorker(request.id, WORKER_ID);

    const worker = new ApiClient(baseUrl);
    await worker.login('worker@homefix.test', 'worker-pass');
    await worker.updateServiceRequestStatus(request.id, 'accepted');
    await worker.updateServiceRequestStatus(request.id, 'in_progress');
    await worker.updateServiceRequestStatus(request.id, 'completed');

    const review = await customer.createReview(request.id, { rating: 5, comment: 'Excellent' });
    assert.equal(review.rating, 5);
    assert.equal(review.workerId, WORKER_ID);

    const reviews = await admin.getWorkerReviews(WORKER_ID);
    assert.equal(reviews.reviewCount, 1);
    assert.equal(reviews.averageRating, 5);
    assert.equal(reviews.items[0].comment, 'Excellent');
  });
});
