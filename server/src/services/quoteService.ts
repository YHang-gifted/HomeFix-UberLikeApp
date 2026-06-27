import { randomUUID } from 'node:crypto';

import type {
  CreateQuoteInput,
  Principal,
  Quote,
  ServiceRequest,
} from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
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
    currency: 'TWD',
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
  return quote;
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
