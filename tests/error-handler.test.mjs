import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createErrorHandler } from '../server/src/middlewares/errorHandler.ts';
import { AppError } from '../server/src/errors/appError.ts';

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    getHeader(name) {
      return name === 'X-Request-Id' ? 'rid-1' : undefined;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('errorHandler', () => {
  it('maps an AppError to its status and message without logging', () => {
    const logged = [];
    const handler = createErrorHandler((entry) => logged.push(entry));
    const res = fakeRes();

    handler(new AppError('nope', 422), { method: 'GET', path: '/x' }, res, () => {});

    assert.equal(res.statusCode, 422);
    assert.deepEqual(res.body, { error: 'nope' });
    assert.equal(logged.length, 0);
  });

  it('logs an unexpected error as structured context and returns a generic 500', () => {
    const logged = [];
    const handler = createErrorHandler((entry) => logged.push(entry));
    const res = fakeRes();

    handler(new Error('boom'), { method: 'POST', path: '/service-requests' }, res, () => {});

    assert.equal(res.statusCode, 500);
    // The client never sees the internal detail.
    assert.deepEqual(res.body, { error: 'Internal Server Error' });

    assert.equal(logged.length, 1);
    const entry = logged[0];
    assert.equal(entry.requestId, 'rid-1');
    assert.equal(entry.method, 'POST');
    assert.equal(entry.path, '/service-requests');
    assert.equal(entry.error, 'Error');
    assert.equal(entry.message, 'boom');
    assert.ok(entry.stack.includes('boom'));
  });

  it('handles a non-Error thrown value', () => {
    const logged = [];
    const handler = createErrorHandler((entry) => logged.push(entry));
    const res = fakeRes();

    handler('a string failure', { method: 'GET', path: '/x' }, res, () => {});

    assert.equal(res.statusCode, 500);
    assert.equal(logged[0].error, 'UnknownError');
    assert.equal(logged[0].message, 'Unknown error');
    assert.equal(logged[0].stack, undefined);
  });
});
