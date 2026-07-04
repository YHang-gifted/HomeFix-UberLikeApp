import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertDirectPayAllowed } from '../server/src/services/paymentService.ts';

describe('assertDirectPayAllowed', () => {
  it('allows the mock direct-pay path when the provider has no external checkout', () => {
    // Does not throw.
    assertDirectPayAllowed({ usesExternalCheckout: false });
  });

  it('blocks direct pay (409) when a real provider uses external checkout', () => {
    assert.throws(
      () => assertDirectPayAllowed({ usesExternalCheckout: true }),
      (error) => error.statusCode === 409,
    );
  });
});
