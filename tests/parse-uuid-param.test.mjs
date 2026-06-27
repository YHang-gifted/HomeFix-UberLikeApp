import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseUuidParam } from '../server/src/controllers/parseUuidParam.ts';

const VALID = '123e4567-e89b-12d3-a456-426614174000';

function fakeReq(params) {
  return { params };
}

describe('parseUuidParam', () => {
  it('returns the value for a valid uuid and does not call next', () => {
    let nextCalled = false;
    const value = parseUuidParam(
      fakeReq({ id: VALID }),
      () => {
        nextCalled = true;
      },
      'id',
      'service request id',
    );
    assert.equal(value, VALID);
    assert.equal(nextCalled, false);
  });

  it('forwards a 422 AppError with the label and returns undefined for a bad uuid', () => {
    let forwarded;
    const value = parseUuidParam(
      fakeReq({ workerId: 'not-a-uuid' }),
      (err) => {
        forwarded = err;
      },
      'workerId',
      'worker id',
    );
    assert.equal(value, undefined);
    assert.equal(forwarded?.statusCode, 422);
    assert.equal(forwarded?.message, 'Invalid worker id');
  });

  it('treats a missing param as invalid', () => {
    let forwarded;
    const value = parseUuidParam(
      fakeReq({}),
      (err) => {
        forwarded = err;
      },
      'id',
      'notification id',
    );
    assert.equal(value, undefined);
    assert.equal(forwarded?.message, 'Invalid notification id');
  });
});
