import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_PLATFORM_FEE_BPS, splitPaymentAmount } from '../shared/schemas.ts';

describe('splitPaymentAmount', () => {
  it('splits at the default 15% with the worker taking the net', () => {
    assert.equal(DEFAULT_PLATFORM_FEE_BPS, 1500);
    assert.deepEqual(splitPaymentAmount(150000, DEFAULT_PLATFORM_FEE_BPS), {
      platformFeeCents: 22500,
      workerNetCents: 127500,
    });
  });

  it('floors the fee so the worker keeps any sub-cent remainder', () => {
    // 1001 * 1500 / 10000 = 150.15 -> floored to 150.
    assert.deepEqual(splitPaymentAmount(1001, 1500), {
      platformFeeCents: 150,
      workerNetCents: 851,
    });
  });

  it('takes nothing at 0 bps and everything at 10000 bps', () => {
    assert.deepEqual(splitPaymentAmount(5000, 0), { platformFeeCents: 0, workerNetCents: 5000 });
    assert.deepEqual(splitPaymentAmount(5000, 10000), {
      platformFeeCents: 5000,
      workerNetCents: 0,
    });
  });
});
