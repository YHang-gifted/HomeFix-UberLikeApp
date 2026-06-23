import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { customerCanCancel } from '../app/src/features/serviceRequests/customerStatus.ts';

describe('customerCanCancel', () => {
  it('allows cancelling a non-terminal request', () => {
    for (const status of ['pending', 'matched', 'accepted', 'in_progress']) {
      assert.equal(customerCanCancel(status), true, status);
    }
  });

  it('forbids cancelling a terminal request', () => {
    assert.equal(customerCanCancel('completed'), false);
    assert.equal(customerCanCancel('cancelled'), false);
  });
});
