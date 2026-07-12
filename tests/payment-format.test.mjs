import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  centsToDollars,
  dollarsToCents,
  formatCents,
} from '../app/src/features/payments/paymentFormat.ts';

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
  it('formats cents as a USD amount with thousands separators', () => {
    assert.equal(formatCents(150000), '$1,500.00');
    assert.equal(formatCents(1230), '$12.30');
    assert.equal(formatCents(0), '$0.00');
  });
});

describe('centsToDollars', () => {
  it('renders whole and fractional amounts without trailing zeros', () => {
    assert.equal(centsToDollars(250000), '2500');
    assert.equal(centsToDollars(150050), '1500.5');
    assert.equal(centsToDollars(150099), '1500.99');
    assert.equal(centsToDollars(150001), '1500.01');
  });

  it('round-trips through dollarsToCents', () => {
    for (const cents of [250000, 150050, 150099, 150001, 100]) {
      assert.equal(dollarsToCents(centsToDollars(cents)), cents);
    }
  });
});
