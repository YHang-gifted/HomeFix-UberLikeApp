import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveQuoteView } from '../app/src/features/quotes/quoteView.ts';

const CUSTOMER = '123e4567-e89b-12d3-a456-426614174000';
const WORKER = '423e4567-e89b-12d3-a456-426614174000';
const OTHER = '523e4567-e89b-12d3-a456-426614174000';

const request = { id: 'r1', customerId: CUSTOMER, workerId: WORKER };
const customer = { id: CUSTOMER, role: 'customer' };
const worker = { id: WORKER, role: 'worker' };

function quote(overrides = {}) {
  return {
    id: 'q1',
    requestId: 'r1',
    customerId: CUSTOMER,
    workerId: WORKER,
    amountCents: 250000,
    currency: 'TWD',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('deriveQuoteView', () => {
  it('lets the assigned worker propose when no quote exists', () => {
    const v = deriveQuoteView({ principal: worker, request, quote: null });
    assert.equal(v.canPropose, true);
    assert.equal(v.canRespond, false);
    assert.equal(v.statusLabel, null);
    assert.equal(v.prefillAmountCents, null);
  });

  it('does not let the worker propose once a quote exists', () => {
    const v = deriveQuoteView({ principal: worker, request, quote: quote() });
    assert.equal(v.canPropose, false);
  });

  it('does not let a non-assigned worker propose', () => {
    const v = deriveQuoteView({ principal: { id: OTHER, role: 'worker' }, request, quote: null });
    assert.equal(v.canPropose, false);
  });

  it('lets the owning customer respond to a pending quote', () => {
    const v = deriveQuoteView({ principal: customer, request, quote: quote() });
    assert.equal(v.canRespond, true);
    assert.equal(v.statusLabel, 'Pending');
  });

  it('does not let the customer respond once the quote is answered', () => {
    const v = deriveQuoteView({
      principal: customer,
      request,
      quote: quote({ status: 'accepted' }),
    });
    assert.equal(v.canRespond, false);
    assert.equal(v.statusLabel, 'Accepted');
  });

  it('prefills the payment amount from an accepted quote only', () => {
    assert.equal(
      deriveQuoteView({ principal: customer, request, quote: quote({ status: 'accepted' }) })
        .prefillAmountCents,
      250000,
    );
    assert.equal(
      deriveQuoteView({ principal: customer, request, quote: quote({ status: 'pending' }) })
        .prefillAmountCents,
      null,
    );
    assert.equal(
      deriveQuoteView({ principal: customer, request, quote: quote({ status: 'declined' }) })
        .prefillAmountCents,
      null,
    );
  });

  it('offers nothing to an unauthenticated viewer', () => {
    const v = deriveQuoteView({ principal: null, request, quote: null });
    assert.equal(v.canPropose, false);
    assert.equal(v.canRespond, false);
  });

  it('shows the declined label without response actions', () => {
    const v = deriveQuoteView({
      principal: customer,
      request,
      quote: quote({ status: 'declined' }),
    });
    assert.equal(v.statusLabel, 'Declined');
    assert.equal(v.canRespond, false);
  });
});
