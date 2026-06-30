import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hasPlatformFee, paymentSplit } from '../app/src/features/payments/paymentSplit.ts';

describe('paymentSplit', () => {
  it('returns the stored split when present', () => {
    assert.deepEqual(
      paymentSplit({ amountCents: 150000, platformFeeCents: 22500, workerNetCents: 127500 }),
      { grossCents: 150000, platformFeeCents: 22500, workerNetCents: 127500 },
    );
  });

  it('falls back to no fee and full net for a legacy payment', () => {
    assert.deepEqual(paymentSplit({ amountCents: 150000 }), {
      grossCents: 150000,
      platformFeeCents: 0,
      workerNetCents: 150000,
    });
  });

  it('derives the net from gross minus fee when only the fee is known', () => {
    assert.deepEqual(paymentSplit({ amountCents: 1000, platformFeeCents: 150 }), {
      grossCents: 1000,
      platformFeeCents: 150,
      workerNetCents: 850,
    });
  });
});

describe('hasPlatformFee', () => {
  it('is true only for a positive fee', () => {
    assert.equal(hasPlatformFee({ amountCents: 1000, platformFeeCents: 150 }), true);
    assert.equal(hasPlatformFee({ amountCents: 1000, platformFeeCents: 0 }), false);
    assert.equal(hasPlatformFee({ amountCents: 1000 }), false);
  });
});
