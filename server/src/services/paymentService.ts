import { randomUUID } from 'node:crypto';

import type {
  CreatePaymentInput,
  Payment,
  Principal,
  ServiceRequest,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
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

  const payment: Payment = {
    id: randomUUID(),
    requestId,
    customerId: request.customerId,
    workerId: request.workerId,
    amountCents: input.amountCents,
    currency: 'TWD',
    status: 'pending',
    createdAt: new Date().toISOString(),
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
