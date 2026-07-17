import { randomUUID } from 'node:crypto';

import type {
  CreateRefundRequestInput,
  Principal,
  RefundRequest,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
import { refundRequestRepository } from '../repositories/refundRequestRepository.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';

/**
 * File a refund request against a request's paid payment. The owning customer only; the payment
 * must exist and be `paid` (not pending, not already refunded); at most one request per payment.
 * This does NOT move any money — it queues the request for an admin to approve (which reuses the
 * existing refund line) or reject. 403/404/409 as appropriate.
 */
export async function requestRefund(
  requestId: string,
  principal: Principal,
  input: CreateRefundRequestInput,
): Promise<RefundRequest> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (principal.role !== 'customer' || principal.id !== request.customerId) {
    throw new AppError('Only the owning customer may request a refund', 403);
  }
  const payment = await paymentRepository.findByRequest(requestId);
  if (!payment) {
    throw new AppError('No payment for this request', 404);
  }
  if (payment.status === 'refunded') {
    throw new AppError('This payment has already been refunded', 409);
  }
  if (payment.status !== 'paid') {
    throw new AppError('A refund can only be requested for a paid payment', 409);
  }
  const existing = await refundRequestRepository.findByRequest(requestId);
  if (existing) {
    throw new AppError('A refund request already exists for this payment', 409);
  }
  const refundRequest: RefundRequest = {
    id: randomUUID(),
    requestId,
    paymentId: payment.id,
    customerId: request.customerId,
    reason: input.reason,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  await refundRequestRepository.save(refundRequest);
  return refundRequest;
}

/**
 * The refund request for a request, visible to the owning customer and to any admin (a worker has
 * no part in it). 404 when the request or its refund request is unknown; 403 otherwise.
 */
export async function getRefundRequest(
  requestId: string,
  principal: Principal,
): Promise<RefundRequest> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  const isOwner = principal.role === 'customer' && principal.id === request.customerId;
  if (!isOwner && principal.role !== 'admin') {
    throw new AppError('Not allowed to view this refund request', 403);
  }
  const refundRequest = await refundRequestRepository.findByRequest(requestId);
  if (!refundRequest) {
    throw new AppError('No refund request for this request', 404);
  }
  return refundRequest;
}

export async function resetRefundRequests(): Promise<void> {
  await refundRequestRepository.clear();
}
