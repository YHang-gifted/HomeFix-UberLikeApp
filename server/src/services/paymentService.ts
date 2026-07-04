import { randomUUID } from 'node:crypto';

import type {
  CreatePaymentInput,
  Payment,
  Principal,
  ServiceRequest,
} from '../../../shared/schemas.ts';
import { splitPaymentAmount } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
import { quoteRepository } from '../repositories/quoteRepository.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { isRequestParty } from './serviceRequestService.ts';
import { recordNotification } from './notificationService.ts';
import { recordAuditEvent } from './auditService.ts';
import { createPayoutForPayment } from './payoutService.ts';
import { paymentProvider } from './paymentProvider.ts';
import type { PaymentProvider } from './paymentProvider.ts';

async function loadRequest(requestId: string): Promise<ServiceRequest> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  return request;
}

/** The payment for a request, visible to any party (customer, worker, admin). */
export async function getPayment(requestId: string, principal: Principal): Promise<Payment> {
  const request = await loadRequest(requestId);
  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to view this payment', 403);
  }
  const payment = await paymentRepository.findByRequest(requestId);
  if (!payment) {
    throw new AppError('No payment for this request', 404);
  }
  return payment;
}

/**
 * List the caller's own payments, most-recent-first. A customer sees the payments
 * they made; a worker sees the payments they received. Admins have no personal
 * payment history and are forbidden.
 */
export async function listMyPayments(principal: Principal): Promise<Payment[]> {
  if (principal.role === 'customer') {
    return paymentRepository.findByCustomer(principal.id);
  }
  if (principal.role === 'worker') {
    return paymentRepository.findByWorker(principal.id);
  }
  throw new AppError('No payment history for this role', 403);
}

/**
 * Create a pending payment for a request. The owning customer only; the request
 * must have an assigned worker, and only one payment may exist per request.
 * Mock only — no money moves.
 */
export async function createPayment(
  requestId: string,
  input: CreatePaymentInput,
  principal: Principal,
): Promise<Payment> {
  const request = await loadRequest(requestId);
  if (principal.role !== 'customer' || principal.id !== request.customerId) {
    throw new AppError('Only the owning customer may set up a payment', 403);
  }
  if (request.workerId === undefined) {
    throw new AppError('This request has no assigned worker to pay', 422);
  }
  const existing = await paymentRepository.findByRequest(requestId);
  if (existing) {
    throw new AppError('A payment already exists for this request', 409);
  }

  // Payment is gated on an accepted quote, and must match its agreed amount, so a
  // customer cannot pay an arbitrary sum before a price has been agreed.
  const quote = await quoteRepository.findByRequest(requestId);
  if (!quote || quote.status !== 'accepted') {
    throw new AppError('An accepted quote is required before payment', 422);
  }
  if (input.amountCents !== quote.amountCents) {
    throw new AppError('Payment amount must match the accepted quote', 422);
  }

  const { platformFeeCents, workerNetCents } = splitPaymentAmount(
    input.amountCents,
    loadEnv().PLATFORM_FEE_BPS,
  );
  const id = randomUUID();
  // Open the charge with the provider (mock by default) and keep its reference so
  // the provider's webhook can later be mapped back to this payment.
  const charge = await paymentProvider.createCharge({
    paymentId: id,
    requestId,
    amountCents: input.amountCents,
    currency: 'TWD',
  });
  const payment: Payment = {
    id,
    requestId,
    customerId: request.customerId,
    workerId: request.workerId,
    amountCents: input.amountCents,
    currency: 'TWD',
    status: 'pending',
    createdAt: new Date().toISOString(),
    platformFeeCents,
    workerNetCents,
    providerRef: charge.providerRef,
  };
  await paymentRepository.save(payment);
  await recordAuditEvent({
    actor: principal,
    action: 'payment.created',
    resourceId: payment.id,
    details: { requestId, amountCents: String(input.amountCents) },
  });
  // Return the provider's client secret (if any) so the app can complete checkout.
  // It is NOT persisted — it rides only on this create response, never a later GET.
  return {
    ...payment,
    ...(charge.clientSecret !== undefined ? { clientSecret: charge.clientSecret } : {}),
  };
}

/**
 * Guard the mock `/pay` endpoint: when a real provider is active (the customer
 * pays at the provider's checkout), a payment must NOT be markable as paid
 * directly — it is settled only by the provider's verified webhook. Throws 409 in
 * that mode; a no-op for the mock provider (dev/test).
 */
export function assertDirectPayAllowed(provider: PaymentProvider): void {
  if (provider.usesExternalCheckout) {
    throw new AppError(
      'This payment is completed at checkout and confirmed automatically once paid.',
      409,
    );
  }
}

/**
 * Settle a pending payment: flip it to paid and notify the worker. The single
 * place a payment becomes paid, reached both by the customer's (mock) checkout
 * and by a payment-provider webhook confirmation.
 */
async function markPaid(payment: Payment): Promise<Payment> {
  const updated: Payment = { ...payment, status: 'paid', paidAt: new Date().toISOString() };
  await paymentRepository.save(updated);
  await recordNotification({
    userId: payment.workerId,
    message: 'Your payment for a completed request has been received.',
    requestId: payment.requestId,
  });
  // The worker's net is scheduled for payout (Model B). Idempotent per payment.
  await createPayoutForPayment(updated);
  return updated;
}

/**
 * Mark a request's payment as paid (mock checkout — no provider is contacted).
 * The owning customer only; notifies the worker.
 */
export async function payPayment(requestId: string, principal: Principal): Promise<Payment> {
  // With a real provider, payments settle only via the verified webhook — the mock
  // direct-pay path is disabled so it can't be used to mark a payment paid for free.
  assertDirectPayAllowed(paymentProvider);
  const request = await loadRequest(requestId);
  if (principal.role !== 'customer' || principal.id !== request.customerId) {
    throw new AppError('Only the owning customer may pay', 403);
  }
  const payment = await paymentRepository.findByRequest(requestId);
  if (!payment) {
    throw new AppError('No payment for this request', 404);
  }
  if (payment.status === 'paid') {
    throw new AppError('This payment has already been paid', 409);
  }
  return markPaid(payment);
}

/**
 * Confirm a payment as paid from a verified provider webhook. Idempotent: an
 * already-paid payment is returned unchanged (providers may retry deliveries).
 * 404 if the referenced payment is unknown. No authorization here — the caller
 * verifies the webhook's authenticity before invoking this.
 */
export async function confirmPaymentPaid(paymentId: string): Promise<Payment> {
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  if (payment.status === 'paid') {
    return payment;
  }
  return markPaid(payment);
}

/**
 * Reverse a paid payment to `refunded` and notify both parties. The single place
 * a payment is refunded, reached by the admin action and by a provider webhook.
 */
async function markRefunded(payment: Payment): Promise<Payment> {
  const updated: Payment = { ...payment, status: 'refunded' };
  await paymentRepository.save(updated);
  await recordNotification({
    userId: payment.workerId,
    message: 'A payment to you was refunded.',
    requestId: payment.requestId,
  });
  await recordNotification({
    userId: payment.customerId,
    message: 'Your payment was refunded.',
    requestId: payment.requestId,
  });
  return updated;
}

/**
 * Admin-only: refund a request's paid payment (mock — no provider is contacted).
 * Only a paid payment can be refunded; a refund is audited. 404 if there is no
 * payment, 409 if it is not paid.
 */
export async function refundPayment(requestId: string, principal: Principal): Promise<Payment> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may refund a payment', 403);
  }
  const payment = await paymentRepository.findByRequest(requestId);
  if (!payment) {
    throw new AppError('No payment for this request', 404);
  }
  if (payment.status !== 'paid') {
    throw new AppError('Only a paid payment can be refunded', 409);
  }
  const refunded = await markRefunded(payment);
  await recordAuditEvent({
    actor: principal,
    action: 'payment.refunded',
    resourceId: payment.id,
  });
  return refunded;
}

/**
 * Confirm a refund from a verified provider webhook. Idempotent: an
 * already-refunded payment is returned unchanged. 404 if unknown, 409 if the
 * payment was never paid. No authorization here — the caller verifies the
 * webhook.
 */
export async function confirmPaymentRefunded(paymentId: string): Promise<Payment> {
  const payment = await paymentRepository.findById(paymentId);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  if (payment.status === 'refunded') {
    return payment;
  }
  if (payment.status !== 'paid') {
    throw new AppError('Only a paid payment can be refunded', 409);
  }
  return markRefunded(payment);
}

/**
 * Confirm a payment as paid from a webhook that references the provider's own
 * charge id. Resolves our payment via that reference, then settles idempotently.
 * 404 if no payment matches the reference.
 */
export async function confirmPaymentPaidByRef(providerRef: string): Promise<Payment> {
  const payment = await paymentRepository.findByProviderRef(providerRef);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  return confirmPaymentPaid(payment.id);
}

/**
 * Confirm a refund from a webhook that references the provider's own charge id.
 * 404 if no payment matches the reference, 409 if it was never paid.
 */
export async function confirmPaymentRefundedByRef(providerRef: string): Promise<Payment> {
  const payment = await paymentRepository.findByProviderRef(providerRef);
  if (!payment) {
    throw new AppError('Payment not found', 404);
  }
  return confirmPaymentRefunded(payment.id);
}

export async function resetPayments(): Promise<void> {
  await paymentRepository.clear();
}
