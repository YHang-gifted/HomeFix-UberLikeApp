import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('profile (/me)', () => {
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

  it('returns the authenticated user profile', async () => {
    const res = await fetch(`${baseUrl}/me`, { headers: headers(CUSTOMER_ID, 'customer') });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, CUSTOMER_ID);
    assert.equal(body.email, 'customer@homefix.test');
    assert.equal(body.role, 'customer');
    assert.ok(typeof body.displayName === 'string' && body.displayName.length > 0);
    assert.equal(body.passwordHash, undefined);
  });

  it('updates the display name', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Wendy the Welder' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.displayName, 'Wendy the Welder');

    const after = await fetch(`${baseUrl}/me`, { headers: headers(WORKER_ID, 'worker') });
    const afterBody = await after.json();
    assert.equal(afterBody.displayName, 'Wendy the Welder');
  });

  it('updates and clears the contact phone', async () => {
    const set = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Demo Worker', phone: '+1 (555) 012-3456' }),
    });
    assert.equal(set.status, 200);
    assert.equal((await set.json()).phone, '+1 (555) 012-3456');

    const persisted = await fetch(`${baseUrl}/me`, { headers: headers(WORKER_ID, 'worker') });
    assert.equal((await persisted.json()).phone, '+1 (555) 012-3456');

    const cleared = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Demo Worker' }),
    });
    assert.equal((await cleared.json()).phone, undefined);
  });

  it('updates and clears the worker bio and skills', async () => {
    const set = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({
        displayName: 'Demo Worker',
        bio: 'Licensed plumber, 10 years experience.',
        skills: ['plumbing', 'electrical'],
      }),
    });
    assert.equal(set.status, 200);
    const setBody = await set.json();
    assert.equal(setBody.bio, 'Licensed plumber, 10 years experience.');
    assert.deepEqual(setBody.skills, ['plumbing', 'electrical']);

    const persisted = await (
      await fetch(`${baseUrl}/me`, { headers: headers(WORKER_ID, 'worker') })
    ).json();
    assert.equal(persisted.bio, 'Licensed plumber, 10 years experience.');
    assert.deepEqual(persisted.skills, ['plumbing', 'electrical']);

    const cleared = await (
      await fetch(`${baseUrl}/me`, {
        method: 'PATCH',
        headers: headers(WORKER_ID, 'worker'),
        body: JSON.stringify({ displayName: 'Demo Worker' }),
      })
    ).json();
    assert.equal(cleared.bio, undefined);
    assert.equal(cleared.skills, undefined);
  });

  it('rejects an unknown skill category (422)', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Demo Worker', skills: ['spaceship'] }),
    });
    assert.equal(res.status, 422);
  });

  it('updates and clears the worker availability', async () => {
    const set = await (
      await fetch(`${baseUrl}/me`, {
        method: 'PATCH',
        headers: headers(WORKER_ID, 'worker'),
        body: JSON.stringify({ displayName: 'Demo Worker', availability: 'away' }),
      })
    ).json();
    assert.equal(set.availability, 'away');

    const cleared = await (
      await fetch(`${baseUrl}/me`, {
        method: 'PATCH',
        headers: headers(WORKER_ID, 'worker'),
        body: JSON.stringify({ displayName: 'Demo Worker' }),
      })
    ).json();
    assert.equal(cleared.availability, undefined);
  });

  it('rejects an invalid availability (422)', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(WORKER_ID, 'worker'),
      body: JSON.stringify({ displayName: 'Demo Worker', availability: 'sleeping' }),
    });
    assert.equal(res.status, 422);
  });

  it('rejects an invalid phone (422)', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ displayName: 'Demo Customer', phone: 'not-a-phone' }),
    });
    assert.equal(res.status, 422);
  });

  it('rejects an empty display name (422)', async () => {
    const res = await fetch(`${baseUrl}/me`, {
      method: 'PATCH',
      headers: headers(CUSTOMER_ID, 'customer'),
      body: JSON.stringify({ displayName: '' }),
    });
    assert.equal(res.status, 422);
  });

  it('returns 401 without authentication', async () => {
    const res = await fetch(`${baseUrl}/me`);
    assert.equal(res.status, 401);
  });
});
