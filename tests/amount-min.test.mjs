import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_AMOUNT_CENTS,
  createPaymentInputSchema,
  createQuoteInputSchema,
} from '../shared/schemas.ts';

describe('minimum chargeable amount', () => {
  it('exposes a NT$1.00 floor', () => {
    assert.equal(MIN_AMOUNT_CENTS, 100);
  });

  for (const [name, schema] of [
    ['createPaymentInputSchema', createPaymentInputSchema],
    ['createQuoteInputSchema', createQuoteInputSchema],
  ]) {
    it(`${name} accepts an amount at the floor`, () => {
      assert.equal(schema.safeParse({ amountCents: MIN_AMOUNT_CENTS }).success, true);
    });

    it(`${name} rejects an amount below the floor`, () => {
      assert.equal(schema.safeParse({ amountCents: MIN_AMOUNT_CENTS - 1 }).success, false);
      assert.equal(schema.safeParse({ amountCents: 0 }).success, false);
      assert.equal(schema.safeParse({ amountCents: -5 }).success, false);
    });

    it(`${name} still accepts a normal amount`, () => {
      assert.equal(schema.safeParse({ amountCents: 150000 }).success, true);
    });
  }
});
