import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createStripePaymentProvider,
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

  it('selectPaymentProvider returns the inert mock when no Stripe key is set', () => {
    assert.equal(selectPaymentProvider({}), mockPaymentProvider);
  });

  it('selectPaymentProvider returns a Stripe-backed provider when a key is set', () => {
    const provider = selectPaymentProvider({ STRIPE_SECRET_KEY: 'sk_test_example' });
    assert.notEqual(provider, mockPaymentProvider);
  });

  it('the mock provider does not use external checkout (mock /pay is allowed)', () => {
    assert.equal(mockPaymentProvider.usesExternalCheckout, false);
  });
});

describe('createStripePaymentProvider', () => {
  const input = {
    paymentId: '623e4567-e89b-12d3-a456-426614174000',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    amountCents: 150000,
    currency: 'TWD',
  };

  it('opens a PaymentIntent and maps its id + client secret (no network)', async () => {
    const calls = [];
    const provider = createStripePaymentProvider((params, options) => {
      calls.push({ params, options });
      return Promise.resolve({ id: 'pi_123', client_secret: 'pi_123_secret_abc' });
    });

    const result = await provider.createCharge(input);

    assert.equal(result.providerRef, 'pi_123');
    assert.equal(result.clientSecret, 'pi_123_secret_abc');
    // Amount in minor units, lowercase currency, our ids in metadata.
    assert.equal(calls[0].params.amount, 150000);
    assert.equal(calls[0].params.currency, 'twd');
    assert.equal(calls[0].params.metadata.paymentId, input.paymentId);
    assert.equal(calls[0].params.metadata.requestId, input.requestId);
    // Idempotent per payment: a retry can't open a second intent.
    assert.equal(calls[0].options.idempotencyKey, input.paymentId);
  });

  it('omits clientSecret when Stripe returns none', async () => {
    const provider = createStripePaymentProvider(() =>
      Promise.resolve({ id: 'pi_456', client_secret: null }),
    );

    const result = await provider.createCharge(input);

    assert.equal(result.providerRef, 'pi_456');
    assert.equal(result.clientSecret, undefined);
  });

  it('uses external checkout (so the mock /pay is disabled in this mode)', () => {
    const provider = createStripePaymentProvider(() =>
      Promise.resolve({ id: 'pi_1', client_secret: null }),
    );
    assert.equal(provider.usesExternalCheckout, true);
  });
});
