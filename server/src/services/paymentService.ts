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
  const payment: Payment = {
    id: randomUUID(),
    requestId,
    customerId: request.customerId,
    workerId: request.workerId,
    amountCents: input.amountCents,
    currency: 'TWD',
    status: 'pending',
    createdAt: new Date().toISOString(),
    platformFeeCents,
    workerNetCents,
  };
  await paymentRepository.save(payment);
  return payment;
}

/**
 * Mark a request's payment as paid (mock checkout — flips status only, no
 * provider is contacted). The owning customer only; notifies the worker.
 */
export async function payPayment(requestId: string, principal: Principal): Promise<Payment> {
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

  const updated: Payment = { ...payment, status: 'paid', paidAt: new Date().toISOString() };
  await paymentRepository.save(updated);
  await recordNotification({
    userId: payment.workerId,
    message: 'Your payment for a completed request has been received.',
    requestId,
  });
  return updated;
}

export async function resetPayments(): Promise<void> {
  await paymentRepository.clear();
}
