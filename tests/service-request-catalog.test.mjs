import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { getCatalogItem } from '../server/src/services/catalogService.ts';

// Fixed-price catalog, slice 2: booking a standardized catalog task sets the price AND the category
// from the trusted catalog (a customer can never invent their own fixed price). A normal request
// (no catalogItemId) stays on the quote track.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const DRAIN = getCatalogItem('drain-unclog');

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('POST /service-requests — fixed-price catalog booking', () => {
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

  function createRequest(body) {
    return fetch(`${baseUrl}/service-requests`, {
      method: 'POST',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify(body),
    });
  }

  const base = {
    customerId: CUSTOMER_ID,
    description: 'The kitchen sink is blocked',
    location: { latitude: 25.03, longitude: 121.56 },
  };

  it('books a catalog task at the catalog price and category (server is authoritative)', async () => {
    // Deliberately send a WRONG category to prove the server overrides it from the catalog.
    const res = await createRequest({
      ...base,
      category: 'general',
      catalogItemId: 'drain-unclog',
    });
    assert.equal(res.status, 201);
    const request = await res.json();
    assert.equal(request.pricingMode, 'fixed');
    assert.equal(request.fixedPriceCents, DRAIN.priceCents);
    assert.equal(request.category, DRAIN.category); // 'plumbing', not the 'general' we sent
  });

  it('rejects an unknown catalog item (400)', async () => {
    const res = await createRequest({
      ...base,
      category: 'plumbing',
      catalogItemId: 'does-not-exist',
    });
    assert.equal(res.status, 400);
  });

  it('leaves a normal request on the quote track (no catalogItemId)', async () => {
    const res = await createRequest({ ...base, category: 'plumbing' });
    assert.equal(res.status, 201);
    const request = await res.json();
    assert.equal(request.pricingMode, 'quote');
    assert.equal(request.fixedPriceCents, undefined);
  });
});
