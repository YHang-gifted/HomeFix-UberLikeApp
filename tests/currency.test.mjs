import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  PLATFORM_CURRENCY,
  currencySchema,
  paymentSchema,
  payoutSchema,
  quoteSchema,
} from '../shared/schemas.ts';

// slice 172: the platform settles in USD (US market). A Stripe transfer to a worker's
// connected account must be in the platform's settlement currency, so quotes, payments, and
// payouts are all denominated in PLATFORM_CURRENCY — one source of truth.

describe('PLATFORM_CURRENCY', () => {
  it('is USD', () => {
    assert.equal(PLATFORM_CURRENCY, 'USD');
  });

  it('accepts the platform currency and rejects any other', () => {
    assert.equal(currencySchema.parse('USD'), 'USD');
    assert.equal(currencySchema.safeParse('TWD').success, false);
    assert.equal(currencySchema.safeParse('usd').success, false);
  });
});

describe('money schemas are denominated in the platform currency', () => {
  const ID = '123e4567-e89b-12d3-a456-426614174000';
  const base = {
    id: ID,
    requestId: ID,
    customerId: ID,
    workerId: ID,
    amountCents: 150000,
    createdAt: '2026-07-11T00:00:00.000Z',
  };

  it('a payment must be in USD', () => {
    const payment = { ...base, currency: 'USD', status: 'pending' };
    assert.equal(paymentSchema.parse(payment).currency, 'USD');
    // Guards the reason migration 0037 exists: the repositories parse rows through these
    // schemas, so a leftover TWD row would throw on read rather than quietly mis-price.
    assert.equal(paymentSchema.safeParse({ ...payment, currency: 'TWD' }).success, false);
  });

  it('a quote must be in USD', () => {
    const quote = { ...base, currency: 'USD', status: 'pending' };
    assert.equal(quoteSchema.parse(quote).currency, 'USD');
    assert.equal(quoteSchema.safeParse({ ...quote, currency: 'TWD' }).success, false);
  });

  it('a payout must be in USD', () => {
    const payout = {
      id: ID,
      paymentId: ID,
      workerId: ID,
      amountCents: 127500,
      currency: 'USD',
      status: 'pending',
      createdAt: base.createdAt,
    };
    assert.equal(payoutSchema.parse(payout).currency, 'USD');
    assert.equal(payoutSchema.safeParse({ ...payout, currency: 'TWD' }).success, false);
  });
});
