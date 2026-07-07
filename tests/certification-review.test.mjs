import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { createApp } from '../server/src/app.ts';
import { signToken } from '../server/src/auth/jwt.ts';
import { resetCertifications } from '../server/src/services/certificationService.ts';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';

function headers(id, role) {
  return { 'content-type': 'application/json', Authorization: `Bearer ${signToken({ id, role })}` };
}

describe('admin certification review', () => {
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

  async function submitCert(overrides = {}) {
    const res = await api(WORKER_ID, 'worker', 'POST', '/certifications', {
      category: 'electrical',
      title: 'Journeyman Electrician License',
      documentUrl: 'https://cdn.example.com/certs/jle.pdf',
      ...overrides,
    });
    return res.json();
  }

  it('lists the pending queue for an admin and forbids a worker (403)', async () => {
    const cert = await submitCert();

    const queue = await (await api(ADMIN_ID, 'admin', 'GET', '/admin/certifications')).json();
    assert.equal(queue.items.length, 1);
    assert.equal(queue.items[0].id, cert.id);
    assert.equal(queue.items[0].status, 'pending');

    assert.equal((await api(WORKER_ID, 'worker', 'GET', '/admin/certifications')).status, 403);
  });

  it('verifies a pending certification and is idempotency-guarded (409 on re-review)', async () => {
    const cert = await submitCert();

    const res = await api(ADMIN_ID, 'admin', 'POST', `/certifications/${cert.id}/review`, {
      decision: 'verify',
    });
    assert.equal(res.status, 200);
    const reviewed = await res.json();
    assert.equal(reviewed.status, 'verified');
    assert.equal(reviewed.reviewerId, ADMIN_ID);
    assert.ok(reviewed.reviewedAt);

    // The worker now sees it verified.
    const mine = await (await api(WORKER_ID, 'worker', 'GET', '/certifications')).json();
    assert.equal(mine.items[0].status, 'verified');

    // A second review of an already-reviewed cert is rejected.
    assert.equal(
      (
        await api(ADMIN_ID, 'admin', 'POST', `/certifications/${cert.id}/review`, {
          decision: 'verify',
        })
      ).status,
      409,
    );
  });

  it('requires a reason to reject and stores it', async () => {
    const cert = await submitCert();

    assert.equal(
      (
        await api(ADMIN_ID, 'admin', 'POST', `/certifications/${cert.id}/review`, {
          decision: 'reject',
        })
      ).status,
      422,
    );

    const res = await api(ADMIN_ID, 'admin', 'POST', `/certifications/${cert.id}/review`, {
      decision: 'reject',
      reason: 'Document is illegible.',
    });
    assert.equal(res.status, 200);
    const rejected = await res.json();
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.rejectionReason, 'Document is illegible.');
  });

  it('forbids a non-admin from reviewing (403) and rejects an invalid decision (422)', async () => {
    const cert = await submitCert();

    assert.equal(
      (
        await api(WORKER_ID, 'worker', 'POST', `/certifications/${cert.id}/review`, {
          decision: 'verify',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await api(ADMIN_ID, 'admin', 'POST', `/certifications/${cert.id}/review`, {
          decision: 'maybe',
        })
      ).status,
      422,
    );
  });

  it('404s reviewing an unknown certification', async () => {
    const res = await api(
      ADMIN_ID,
      'admin',
      'POST',
      '/certifications/523e4567-e89b-12d3-a456-426614174999/review',
      { decision: 'verify' },
    );
    assert.equal(res.status, 404);
  });
});
