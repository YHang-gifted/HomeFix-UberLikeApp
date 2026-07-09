import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPaypalPaymentProvider,
  createStripePaymentProvider,
  mockPaymentProvider,
  selectPaymentProvider,
  selectPaymentProviderForMethod,
} from '../server/src/services/paymentProvider.ts';

describe('selectPaymentProviderForMethod', () => {
  it('gives the mock provider for card / unspecified when no real provider is set', () => {
    assert.equal(selectPaymentProviderForMethod(undefined).id, 'mock');
    assert.equal(selectPaymentProviderForMethod('card').id, 'mock');
  });

  it('rejects paypal with 400 until the adapter is wired', () => {
    assert.throws(
      () => selectPaymentProviderForMethod('paypal'),
      (error) => error.statusCode === 400,
    );
  });
});

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

  it('selectPaymentProvider returns a Stripe-backed provider when key + return URLs are set', () => {
    const provider = selectPaymentProvider({
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_CHECKOUT_SUCCESS_URL: 'https://app.example.com/pay/success',
      STRIPE_CHECKOUT_CANCEL_URL: 'https://app.example.com/pay/cancel',
    });
    assert.notEqual(provider, mockPaymentProvider);
    assert.equal(provider.usesExternalCheckout, true);
  });

  it('selectPaymentProvider fails fast when a key is set but return URLs are missing', () => {
    assert.throws(
      () => selectPaymentProvider({ STRIPE_SECRET_KEY: 'sk_test_example' }),
      /SUCCESS_URL/,
    );
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

  it('opens a Checkout Session and maps its URL + PaymentIntent id (no network)', async () => {
    const calls = [];
    const provider = createStripePaymentProvider((params, options) => {
      calls.push({ params, options });
      return Promise.resolve({
        id: 'cs_1',
        url: 'https://checkout.stripe.com/pay/cs_1',
        paymentIntentId: 'pi_1',
      });
    });

    const result = await provider.createCharge(input);

    // providerRef is the PaymentIntent id (what the webhook references).
    assert.equal(result.providerRef, 'pi_1');
    assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/pay/cs_1');
    assert.equal(result.clientSecret, undefined);
    // Amount in minor units, lowercase currency, our ids in metadata.
    assert.equal(calls[0].params.amountCents, 150000);
    assert.equal(calls[0].params.currency, 'twd');
    assert.equal(calls[0].params.metadata.paymentId, input.paymentId);
    assert.equal(calls[0].params.metadata.requestId, input.requestId);
    // Idempotent per payment: a retry can't open a second session.
    assert.equal(calls[0].options.idempotencyKey, input.paymentId);
  });

  it('falls back to the session id when Stripe has no PaymentIntent id yet', async () => {
    const provider = createStripePaymentProvider(() =>
      Promise.resolve({
        id: 'cs_2',
        url: 'https://checkout.stripe.com/pay/cs_2',
        paymentIntentId: null,
      }),
    );

    const result = await provider.createCharge(input);

    assert.equal(result.providerRef, 'cs_2');
    assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/pay/cs_2');
  });

  it('omits checkoutUrl when Stripe returns no URL', async () => {
    const provider = createStripePaymentProvider(() =>
      Promise.resolve({ id: 'cs_3', url: null, paymentIntentId: 'pi_3' }),
    );

    const result = await provider.createCharge(input);

    assert.equal(result.providerRef, 'pi_3');
    assert.equal(result.checkoutUrl, undefined);
  });

  it('uses external checkout (so the mock /pay is disabled in this mode)', () => {
    const provider = createStripePaymentProvider(() =>
      Promise.resolve({ id: 'cs_1', url: null, paymentIntentId: 'pi_1' }),
    );
    assert.equal(provider.usesExternalCheckout, true);
  });
});

describe('createPaypalPaymentProvider', () => {
  const input = {
    paymentId: '623e4567-e89b-12d3-a456-426614174000',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    amountCents: 150000,
    currency: 'TWD',
  };

  it('opens an order and returns its approval URL + id (no network)', async () => {
    const calls = [];
    const provider = createPaypalPaymentProvider((params) => {
      calls.push(params);
      return Promise.resolve({
        id: 'ORDER-1',
        approveUrl: 'https://www.paypal.com/checkoutnow?token=ORDER-1',
      });
    });

    assert.equal(provider.id, 'paypal');
    assert.equal(provider.usesExternalCheckout, true);

    const result = await provider.createCharge(input);
    assert.equal(result.providerRef, 'ORDER-1');
    assert.equal(result.checkoutUrl, 'https://www.paypal.com/checkoutnow?token=ORDER-1');
    // Our ids ride on the order so the capture webhook can map back.
    assert.equal(calls[0].amountCents, 150000);
    assert.equal(calls[0].metadata.paymentId, input.paymentId);
    assert.equal(calls[0].metadata.requestId, input.requestId);
  });

  it('omits checkoutUrl when the order has no approval link', async () => {
    const provider = createPaypalPaymentProvider(() =>
      Promise.resolve({ id: 'ORDER-2', approveUrl: null }),
    );
    const result = await provider.createCharge(input);
    assert.equal(result.providerRef, 'ORDER-2');
    assert.equal(result.checkoutUrl, undefined);
  });
});
