import { randomUUID } from 'node:crypto';

import type { CreateMessageInput, Message, Principal } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { messageRepository } from '../repositories/messageRepository.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { isRequestParty } from './serviceRequestService.ts';
import { messageHub } from './messageHub.ts';

async function requireParty(requestId: string, principal: Principal): Promise<void> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to access messages for this request', 403);
  }
}

/** The message thread for a request, oldest first. Visible only to its parties. */
export async function listMessages(requestId: string, principal: Principal): Promise<Message[]> {
  await requireParty(requestId, principal);
  return messageRepository.listByRequest(requestId);
}

/** Post a message to a request's thread as the principal. Parties only. */
export async function postMessage(
  requestId: string,
  input: CreateMessageInput,
  principal: Principal,
): Promise<Message> {
  await requireParty(requestId, principal);
  const message: Message = {
    id: randomUUID(),
    requestId,
    senderId: principal.id,
    senderRole: principal.role,
    body: input.body,
    createdAt: new Date().toISOString(),
  };
  await messageRepository.save(message);
  // Notify any live subscribers (the WebSocket layer) so connected parties see the
  // message without polling. Best-effort, in-process; persistence already happened.
  messageHub.publish(message);
  return message;
}

export async function resetMessages(): Promise<void> {
  await messageRepository.clear();
}
