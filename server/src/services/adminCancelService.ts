import type { Principal, ServiceRequest } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
import { refundPayment } from './paymentService.ts';
import { reversePendingPayout } from './payoutService.ts';
import { updateServiceRequestStatus } from './serviceRequestService.ts';

/**
 * Admin-only "cancel and refund": cancel a request, refunding a settled payment
 * first so no money is orphaned. This is the deliberate counterpart to SEC-0006,
 * which blocks a plain cancel on a paid request (there is no refund in that path).
 *
 * Orchestrates across three services (payment, payout, request) from a standalone
 * module so it does not add an import cycle between them:
 *  1. If the request has a paid payment, reverse the worker's still-pending payout
 *     (409 if the worker was already paid out — that needs a manual clawback), then
 *     refund the payment (paid -> refunded, audited).
 *  2. Cancel the request. With the payment now refunded (not paid), the SEC-0006
 *     guard no longer blocks the transition.
 *
 * An unpaid request just cancels. Admin-only; the owning customer keeps the plain
 * self-serve cancel for unpaid requests.
 */
export async function adminCancelRequestWithRefund(
  requestId: string,
  principal: Principal,
  reason?: string,
): Promise<ServiceRequest> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may cancel a request with a refund', 403);
  }

  const payment = await paymentRepository.findByRequest(requestId);
  if (payment?.status === 'paid') {
    // Order matters: the payout check can abort (409) before any state changes,
    // so we never refund without also having reversed the payout.
    await reversePendingPayout(payment.id);
    await refundPayment(requestId, principal);
  }

  return updateServiceRequestStatus(requestId, 'cancelled', principal, reason);
}
