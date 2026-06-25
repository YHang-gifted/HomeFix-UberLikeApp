import { randomUUID } from 'node:crypto';

import type { AuditAction, AuditEvent, Principal } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { auditRepository } from '../repositories/auditRepository.ts';

export interface AuditPage {
  items: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

/** Append an audit record for a sensitive operation. Never throws to the caller. */
export async function recordAuditEvent(params: {
  actor: Principal;
  action: AuditAction;
  resourceId: string;
  details?: Record<string, string>;
}): Promise<void> {
  const event: AuditEvent = {
    id: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: params.actor.id,
    actorRole: params.actor.role,
    action: params.action,
    resourceId: params.resourceId,
    ...(params.details !== undefined ? { details: params.details } : {}),
  };
  await auditRepository.append(event);
}

/** Admin-only: read the audit log, most recent first. */
export async function listAuditEvents(
  principal: Principal,
  limit: number,
  offset: number,
): Promise<AuditPage> {
  if (principal.role !== 'admin') {
    throw new AppError('Only an admin may read the audit log', 403);
  }
  const all = await auditRepository.findAll();
  const sorted = [...all].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const items = sorted.slice(offset, offset + limit);
  return { items, total: all.length, limit, offset };
}

/** Audit events for a single resource (e.g. a request), oldest first. No auth — callers gate access. */
export async function listEventsForResource(resourceId: string): Promise<AuditEvent[]> {
  const events = await auditRepository.findByResource(resourceId);
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function resetAuditEvents(): Promise<void> {
  await auditRepository.clear();
}
