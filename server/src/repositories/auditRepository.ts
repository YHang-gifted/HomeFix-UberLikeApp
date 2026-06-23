import type { AuditEvent } from '../../../shared/schemas.ts';

// In-memory append-only audit log. Swap for a persistent store later.
const events: AuditEvent[] = [];

export function appendAuditEvent(event: AuditEvent): Promise<void> {
  events.push(event);
  return Promise.resolve();
}

export function findAuditEvents(): Promise<AuditEvent[]> {
  return Promise.resolve([...events]);
}

export function clearAuditEvents(): Promise<void> {
  events.length = 0;
  return Promise.resolve();
}
