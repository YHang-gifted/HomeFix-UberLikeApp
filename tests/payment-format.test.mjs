import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dollarsToCents, formatCents } from '../app/src/features/payments/paymentFormat.ts';

describe('dollarsToCents', () => {
  it('parses whole dollars', () => {
    assert.equal(dollarsToCents('1500'), 150000);
  });

  it('parses dollars with cents', () => {
    assert.equal(dollarsToCents('1500.50'), 150050);
    assert.equal(dollarsToCents(' 12.3 '), 1230);
  });

  it('rejects non-positive, empty, and malformed input', () => {
    assert.equal(dollarsToCents('0'), null);
    assert.equal(dollarsToCents(''), null);
    assert.equal(dollarsToCents('-5'), null);
    assert.equal(dollarsToCents('1.234'), null);
    assert.equal(dollarsToCents('abc'), null);
  });
});

describe('formatCents', () => {
  it('formats cents as a TWD amount with thousands separators', () => {
    assert.equal(formatCents(150000), 'NT$1,500.00');
    assert.equal(formatCents(1230), 'NT$12.30');
    assert.equal(formatCents(0), 'NT$0.00');
  });
});
