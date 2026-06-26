import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetFavorites } from '../server/src/services/favoriteService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const UNKNOWN_ID = '999e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('favorites', () => {
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
    await resetFavorites();
  });

  it('starts empty, then favoriting a worker returns it in the list', async () => {
    const before = await (
      await fetch(`${baseUrl}/favorites`, { headers: headers(CUSTOMER_ID, 'customer') })
    ).json();
    assert.deepEqual(before, []);

    const put = await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
      method: 'PUT',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(put.status, 200);
    const list = await put.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, WORKER_ID);
    assert.equal(list[0].displayName, 'Demo Worker');
    assert.equal(list[0].role, 'worker');
  });

  it('favoriting is idempotent', async () => {
    await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
      method: 'PUT',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    const second = await (
      await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
        method: 'PUT',
        headers: headers(CUSTOMER_ID, 'customer'),
      })
    ).json();
    assert.equal(second.length, 1);
  });

  it('unfavoriting removes the worker (and is idempotent)', async () => {
    await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
      method: 'PUT',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    const afterDelete = await (
      await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
        method: 'DELETE',
        headers: headers(CUSTOMER_ID, 'customer'),
      })
    ).json();
    assert.deepEqual(afterDelete, []);

    const again = await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
      method: 'DELETE',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(again.status, 200);
  });

  it('favorites are scoped per customer', async () => {
    await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
      method: 'PUT',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    const otherCustomer = '223e4567-e89b-12d3-a456-426614174000';
    const list = await (
      await fetch(`${baseUrl}/favorites`, { headers: headers(otherCustomer, 'customer') })
    ).json();
    assert.deepEqual(list, []);
  });

  it('returns 404 when favoriting an id that is not a worker', async () => {
    const unknown = await fetch(`${baseUrl}/favorites/${UNKNOWN_ID}`, {
      method: 'PUT',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(unknown.status, 404);

    const notWorker = await fetch(`${baseUrl}/favorites/${CUSTOMER_ID}`, {
      method: 'PUT',
      headers: headers(CUSTOMER_ID, 'customer'),
    });
    assert.equal(notWorker.status, 404);
  });

  it('forbids non-customers from managing favorites (403)', async () => {
    const asAdmin = await fetch(`${baseUrl}/favorites`, { headers: headers(ADMIN_ID, 'admin') });
    assert.equal(asAdmin.status, 403);

    const workerPut = await fetch(`${baseUrl}/favorites/${WORKER_ID}`, {
      method: 'PUT',
      headers: headers(WORKER_ID, 'worker'),
    });
    assert.equal(workerPut.status, 403);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/favorites`);
    assert.equal(res.status, 401);
  });
});
