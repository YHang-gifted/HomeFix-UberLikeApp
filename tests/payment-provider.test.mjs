import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mockPaymentProvider,
  selectPaymentProvider,
} from '../server/src/services/paymentProvider.ts';

describe('mockPaymentProvider', () => {
  it('assigns a mock provider reference and contacts nothing external', async () => {
    const result = await mockPaymentProvider.createCharge({
      paymentId: '623e4567-e89b-12d3-a456-426614174000',
      requestId: '523e4567-e89b-12d3-a456-426614174000',
      amountCents: 150000,
      currency: 'TWD',
    });
    assert.match(result.providerRef, /^mock_/);
    assert.equal(result.clientSecret, undefined);
  });

  it('gives a distinct reference to each charge', async () => {
    const a = await mockPaymentProvider.createCharge({
      paymentId: '1',
      requestId: 'r',
      amountCents: 100,
      currency: 'TWD',
    });
    const b = await mockPaymentProvider.createCharge({
      paymentId: '2',
      requestId: 'r',
      amountCents: 100,
      currency: 'TWD',
    });
    assert.notEqual(a.providerRef, b.providerRef);
  });

  it('selectPaymentProvider returns the inert mock by default', () => {
    assert.equal(selectPaymentProvider(), mockPaymentProvider);
  });
});
