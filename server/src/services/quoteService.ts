import { randomUUID } from 'node:crypto';

import type {
  CreateQuoteInput,
  Principal,
  Quote,
  ReviseQuoteInput,
  ServiceRequest,
} from '../../../shared/schemas.ts';
import { PLATFORM_CURRENCY } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { paymentRepository } from '../repositories/paymentRepository.ts';
import { quoteRepository } from '../repositories/quoteRepository.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { isRequestParty } from './serviceRequestService.ts';
import { recordNotification } from './notificationService.ts';
import { recordAuditEvent } from './auditService.ts';

async function loadRequest(requestId: string): Promise<ServiceRequest> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  return request;
}

/** The quote for a request, visible to any party (customer, worker, admin). */
export async function getQuote(requestId: string, principal: Principal): Promise<Quote> {
  const request = await loadRequest(requestId);
  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to view this quote', 403);
  }
  const quote = await quoteRepository.findByRequest(requestId);
  if (!quote) {
    throw new AppError('No quote for this request', 404);
  }
  return quote;
}

/**
 * Propose a price quote for a request. The assigned worker only; one quote per
 * request. Notifies the owning customer.
 */
export async function createQuote(
  requestId: string,
  input: CreateQuoteInput,
  principal: Principal,
): Promise<Quote> {
  const request = await loadRequest(requestId);
  if (request.workerId === undefined || principal.id !== request.workerId) {
    throw new AppError('Only the assigned worker may propose a quote', 403);
  }
  // A catalog job's price is set by the platform, not the worker. The accepted quote is minted on
  // assignment, so the "already exists" check below would catch this too — this is the explicit,
  // defence-in-depth guard on a money path, with a message that says why.
  if (request.pricingMode === 'fixed') {
    throw new AppError('This job has a fixed price and cannot be quoted', 409);
  }
  const existing = await quoteRepository.findByRequest(requestId);
  if (existing) {
    throw new AppError('A quote already exists for this request', 409);
  }

  const quote: Quote = {
    id: randomUUID(),
    requestId,
    customerId: request.customerId,
    workerId: request.workerId,
    amountCents: input.amountCents,
    currency: PLATFORM_CURRENCY,
    ...(input.note !== undefined && input.note !== '' ? { note: input.note } : {}),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  await quoteRepository.save(quote);
  await recordNotification({
    userId: request.customerId,
    message: 'Your worker sent a price quote for your request.',
    requestId,
  });
  await recordAuditEvent({
    actor: principal,
    action: 'quote.proposed',
    resourceId: quote.id,
    details: { requestId, amountCents: String(input.amountCents) },
  });
  return quote;
}

/**
 * An on-site scope change: the assigned worker, already on the job, proposes a **revised total**
 * because the work turned out bigger than priced. Rather than model a separate "variation" entity,
 * this reuses the quote itself — the price goes back to `pending` at the new amount with the
 * worker's reason, and the customer agrees through the ordinary accept endpoint. Everything
 * downstream (payment, payout, receipt, refund) is unchanged because it all keys off the accepted
 * quote's amount (`docs/pricing-model.md` §5).
 *
 * This is also how a **fixed-price catalog job** absorbs a bigger job than the photos showed — so
 * an under-priced standard job becomes an agreed price change rather than a dispute.
 *
 * Assigned worker only; only once the job is under way; and only while the money has not moved —
 * a paid job is a refund question, not a price change. A *pending* (unpaid) payment was set up at
 * the old price, so it is voided and the customer re-creates it at the agreed amount.
 */
export async function reviseQuote(
  requestId: string,
  input: ReviseQuoteInput,
  principal: Principal,
): Promise<Quote> {
  const request = await loadRequest(requestId);
  if (request.workerId === undefined || principal.id !== request.workerId) {
    throw new AppError('Only the assigned worker may revise the price', 403);
  }
  if (request.status !== 'accepted' && request.status !== 'in_progress') {
    throw new AppError('The price can only be revised once the job is under way', 409);
  }
  const quote = await quoteRepository.findByRequest(requestId);
  if (!quote) {
    throw new AppError('No quote for this request', 404);
  }

  const payment = await paymentRepository.findByRequest(requestId);
  if (payment) {
    if (payment.status !== 'pending') {
      throw new AppError('This job has been paid; the price can no longer be revised', 409);
    }
    // Only a pending payment reaches here: it was set up at the OLD price, so it is void. The
    // customer re-creates it at the agreed amount.
    await paymentRepository.deleteByRequest(requestId);
  }

  const updated: Quote = {
    id: quote.id,
    requestId: quote.requestId,
    customerId: quote.customerId,
    workerId: quote.workerId,
    amountCents: input.amountCents,
    currency: quote.currency,
    note: input.reason,
    status: 'pending',
    createdAt: quote.createdAt,
    // `respondedAt` is deliberately dropped: the revised price awaits a fresh decision.
  };
  await quoteRepository.save(updated);

  await recordNotification({
    userId: quote.customerId,
    message: 'Your worker proposed a revised price for extra work found on site.',
    requestId,
  });
  await recordAuditEvent({
    actor: principal,
    action: 'quote.revised',
    resourceId: quote.id,
    details: {
      requestId,
      fromAmountCents: String(quote.amountCents),
      toAmountCents: String(input.amountCents),
      reason: input.reason,
    },
  });
  return updated;
}

/**
 * Accept or decline a pending quote. The owning customer only; the quote must
 * still be pending. Notifies the worker of the decision.
 */
async function respondToQuote(
  requestId: string,
  decision: 'accepted' | 'declined',
  principal: Principal,
): Promise<Quote> {
  const request = await loadRequest(requestId);
  if (principal.role !== 'customer' || principal.id !== request.customerId) {
    throw new AppError('Only the owning customer may respond to a quote', 403);
  }
  const quote = await quoteRepository.findByRequest(requestId);
  if (!quote) {
    throw new AppError('No quote for this request', 404);
  }
  if (quote.status !== 'pending') {
    throw new AppError('This quote has already been responded to', 409);
  }

  const updated: Quote = { ...quote, status: decision, respondedAt: new Date().toISOString() };
  await quoteRepository.save(updated);
  await recordNotification({
    userId: quote.workerId,
    message:
      decision === 'accepted'
        ? 'The customer accepted your price quote.'
        : 'The customer declined your price quote.',
    requestId,
  });
  await recordAuditEvent({
    actor: principal,
    action: decision === 'accepted' ? 'quote.accepted' : 'quote.declined',
    resourceId: quote.id,
    details: { requestId },
  });
  return updated;
}

export function acceptQuote(requestId: string, principal: Principal): Promise<Quote> {
  return respondToQuote(requestId, 'accepted', principal);
}

export function declineQuote(requestId: string, principal: Principal): Promise<Quote> {
  return respondToQuote(requestId, 'declined', principal);
}

export async function resetQuotes(): Promise<void> {
  await quoteRepository.clear();
}
