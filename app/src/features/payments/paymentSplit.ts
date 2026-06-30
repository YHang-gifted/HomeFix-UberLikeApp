/**
 * The marketplace split of a payment. Computed defensively from a payment's
 * optional split fields so it works for legacy/zero-fee payments too: the fee
 * defaults to 0, and the worker net falls back to gross minus fee.
 */
export interface PaymentSplit {
  grossCents: number;
  platformFeeCents: number;
  workerNetCents: number;
}

/** A payment's amount fields (a subset of the shared Payment type). */
export interface PaymentAmounts {
  amountCents: number;
  platformFeeCents?: number;
  workerNetCents?: number;
}

export function paymentSplit(payment: PaymentAmounts): PaymentSplit {
  const grossCents = payment.amountCents;
  const platformFeeCents = payment.platformFeeCents ?? 0;
  const workerNetCents = payment.workerNetCents ?? grossCents - platformFeeCents;
  return { grossCents, platformFeeCents, workerNetCents };
}

/** Whether a payment carries a non-zero platform commission worth showing. */
export function hasPlatformFee(payment: PaymentAmounts): boolean {
  return (payment.platformFeeCents ?? 0) > 0;
}
