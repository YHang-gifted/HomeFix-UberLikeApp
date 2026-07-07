import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetCertifications } from '../server/src/services/certificationService.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('worker certifications', () => {
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
    await resetCertifications();
  });

  function api(id, role, method, path, body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: headers(id, role),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  const validCert = {
    category: 'electrical',
    title: 'Journeyman Electrician License',
    documentUrl: 'https://cdn.example.com/certs/jle.pdf',
  };

  it('lets a worker submit a certification (pending) and list their own', async () => {
    const res = await api(WORKER_ID, 'worker', 'POST', '/certifications', validCert);
    assert.equal(res.status, 201);
    const created = await res.json();
    assert.equal(created.workerId, WORKER_ID);
    assert.equal(created.category, 'electrical');
    assert.equal(created.title, 'Journeyman Electrician License');
    assert.equal(created.status, 'pending');
    assert.equal(created.documentUrl, validCert.documentUrl);

    const list = await (await api(WORKER_ID, 'worker', 'GET', '/certifications')).json();
    assert.equal(list.items.length, 1);
    assert.equal(list.items[0].id, created.id);
  });

  it('forbids a customer from submitting or listing certifications (403)', async () => {
    assert.equal(
      (await api(CUSTOMER_ID, 'customer', 'POST', '/certifications', validCert)).status,
      403,
    );
    assert.equal((await api(CUSTOMER_ID, 'customer', 'GET', '/certifications')).status, 403);
  });

  it('rejects an invalid payload (422): bad category, missing url', async () => {
    assert.equal(
      (
        await api(WORKER_ID, 'worker', 'POST', '/certifications', {
          ...validCert,
          category: 'not-a-category',
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await api(WORKER_ID, 'worker', 'POST', '/certifications', {
          category: 'electrical',
          title: 'X',
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await api(WORKER_ID, 'worker', 'POST', '/certifications', {
          ...validCert,
          documentUrl: 'not-a-url',
        })
      ).status,
      422,
    );
  });
});
