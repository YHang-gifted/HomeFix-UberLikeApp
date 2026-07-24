import { randomUUID } from 'node:crypto';

import type {
  CreateRefundRequestInput,
  Principal,
  RefundRequest,
  RefundRequestStatus,
  ResolveRefundRequestInput,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
import { refundRequestRepository } from '../repositories/refundRequestRepository.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { recordAuditEvent } from './auditService.ts';
import { recordNotification } from './notificationService.ts';
import { refundPayment } from './paymentService.ts';

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
  // At most one active refund request per payment — but a *rejected* one must not lock the customer
  // out of a genuine dispute. A rejected request can be re-filed (an appeal): it reuses the same row
  // (re-opening it with the new reason and a fresh timestamp), so the "one per payment" invariant
  // holds while the prior rejection remains in the audit log. An open or approved request still 409s.
  const existing = await refundRequestRepository.findByRequest(requestId);
  if (existing !== undefined && existing.status !== 'rejected') {
    throw new AppError('A refund request already exists for this payment', 409);
  }
  const refundRequest: RefundRequest = {
    id: existing?.status === 'rejected' ? existing.id : randomUUID(),
    requestId,
    paymentId: payment.id,
    customerId: request.customerId,
    reason: input.reason,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  await refundRequestRepository.save(refundRequest);
  await recordAuditEvent({
    actor: principal,
    action: 'refund_request.created',
    resourceId: refundRequest.id,
    details: { requestId, paymentId: payment.id },
  });
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

/**
 * The admin refund-request queue, most-recent-first, optionally filtered by status. Admin-only.
 */
export async function listRefundRequests(
  principal: Principal,
  status?: RefundRequestStatus,
): Promise<RefundRequest[]> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may view refund requests', 403);
  }
  const all = await refundRequestRepository.list();
  return status === undefined ? all : all.filter((r) => r.status === status);
}

/**
 * Resolve an open refund request. Admin-only. `approve` runs the existing refund line first
 * (`refundPayment` — reverses the worker's payout, refunds at the provider, marks the payment
 * refunded, and audits it); only if that succeeds is the request marked `approved`. So if the
 * payout was already paid out, `refundPayment` throws 409 and the request stays `open` for a manual
 * clawback rather than being falsely marked resolved. `reject` needs a note (the customer is told
 * why). Either way the customer is notified and the resolution is audited. 403/404/409/422.
 */
export async function resolveRefundRequest(
  id: string,
  input: ResolveRefundRequestInput,
  principal: Principal,
): Promise<RefundRequest> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may resolve refund requests', 403);
  }
  const refundRequest = await refundRequestRepository.findById(id);
  if (!refundRequest) {
    throw new AppError('Refund request not found', 404);
  }
  if (refundRequest.status !== 'open') {
    throw new AppError('This refund request has already been resolved', 409);
  }
  const note = input.note?.trim();
  if (input.decision === 'reject' && (note === undefined || note === '')) {
    throw new AppError('A reason is required to reject a refund request', 422);
  }

  if (input.decision === 'approve') {
    // Reuse the proven admin refund. If it throws (e.g. the payout was already sent → 409), the
    // request is left open and nothing below runs, so it is never falsely marked approved.
    await refundPayment(refundRequest.requestId, principal);
  }

  const updated: RefundRequest = {
    ...refundRequest,
    status: input.decision === 'approve' ? 'approved' : 'rejected',
    resolvedAt: new Date().toISOString(),
    resolvedBy: principal.id,
    ...(note !== undefined && note !== '' ? { resolutionNote: note } : {}),
  };
  await refundRequestRepository.save(updated);

  await recordNotification({
    userId: refundRequest.customerId,
    message:
      input.decision === 'approve'
        ? 'Your refund request was approved and your payment refunded.'
        : `Your refund request was declined: ${note ?? ''}`,
    requestId: refundRequest.requestId,
  });
  await recordAuditEvent({
    actor: principal,
    action: input.decision === 'approve' ? 'refund_request.approved' : 'refund_request.rejected',
    resourceId: refundRequest.id,
    details: { requestId: refundRequest.requestId, paymentId: refundRequest.paymentId },
  });
  return updated;
}

export async function resetRefundRequests(): Promise<void> {
  await refundRequestRepository.clear();
}
