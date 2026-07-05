import type { AdminStats, Principal, RequestsByStatus } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
import { payoutRepository } from '../repositories/payoutRepository.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { userRepository } from '../repositories/userRepository.ts';

function emptyByStatus(): RequestsByStatus {
  return {
    pending: 0,
    matched: 0,
    accepted: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
}

/** Admin-only dashboard summary aggregated across requests, payments, and workers. */
export async function getAdminStats(principal: Principal): Promise<AdminStats> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may view dashboard stats', 403);
  }

  const [requests, paid, workers, payouts] = await Promise.all([
    serviceRequestRepository.findAll(),
    paymentRepository.paidTotals(),
    userRepository.listByRole('worker'),
    payoutRepository.outstandingTotals(),
  ]);

  const requestsByStatus = emptyByStatus();
  for (const request of requests) {
    requestsByStatus[request.status] += 1;
  }

  return {
    totalRequests: requests.length,
    requestsByStatus,
    paidPaymentsCount: paid.count,
    paidAmountCents: paid.amountCents,
    workerCount: workers.length,
    pendingPayoutsCount: payouts.pendingCount,
    pendingPayoutAmountCents: payouts.pendingAmountCents,
    paidPayoutsCount: payouts.paidCount,
    paidPayoutAmountCents: payouts.paidAmountCents,
  };
}
