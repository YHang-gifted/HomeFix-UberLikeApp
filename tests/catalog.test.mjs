import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { catalogListSchema } from '../shared/schemas.ts';

// Fixed-price catalog, slice 1: a read-only source of standardized tasks the platform prices up
// front (the "price-first" track). No request/payment wiring yet — that's a later slice.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('GET /catalog', () => {
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

  it('returns the catalog to a signed-in user, matching the schema', async () => {
    const res = await fetch(`${baseUrl}/catalog`, { headers: headers(CUSTOMER_ID, 'customer') });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Parses against the shared schema (valid id/category/title/priceCents on every item).
    const parsed = catalogListSchema.parse(body);
    assert.ok(parsed.items.length > 0);
    // A stable, known item is present and priced.
    const drain = parsed.items.find((item) => item.id === 'drain-unclog');
    assert.ok(drain, 'the drain-unclog item should exist');
    assert.equal(drain.category, 'plumbing');
    assert.ok(drain.priceCents > 0);
    // Ids are unique.
    const ids = parsed.items.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('requires authentication (401)', async () => {
    const res = await fetch(`${baseUrl}/catalog`, {
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(res.status, 401);
  });
});
