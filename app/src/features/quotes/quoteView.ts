import type { Principal, Quote, ServiceRequest } from '../../../../shared/schemas.ts';

/** What the quote section of the request screen should offer for the current viewer. */
export interface QuoteView {
  /** The assigned worker may propose a quote (one doesn't exist yet). */
  canPropose: boolean;
  /** The owning customer may accept or decline a still-pending quote. */
  canRespond: boolean;
  /** Human label for the current quote status, or null when there is no quote. */
  statusLabel: string | null;
  /** When a quote is accepted, the amount to prefill the payment with, else null. */
  prefillAmountCents: number | null;
}

const STATUS_LABELS: Record<Quote['status'], string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
};

/**
 * Derive the quote section's state from the viewer, the request, and the current
 * quote (null when none exists). Pure: no I/O, so it is unit-tested directly.
 */
export function deriveQuoteView(args: {
  principal: Principal | null;
  request: ServiceRequest;
  quote: Quote | null;
}): QuoteView {
  const { principal, request, quote } = args;

  const isAssignedWorker =
    principal !== null &&
    principal.role === 'worker' &&
    request.workerId !== undefined &&
    principal.id === request.workerId;

  const isOwner =
    principal !== null && principal.role === 'customer' && principal.id === request.customerId;

  return {
    canPropose: isAssignedWorker && quote === null,
    canRespond: isOwner && quote !== null && quote.status === 'pending',
    statusLabel: quote === null ? null : STATUS_LABELS[quote.status],
    prefillAmountCents: quote !== null && quote.status === 'accepted' ? quote.amountCents : null,
  };
}
