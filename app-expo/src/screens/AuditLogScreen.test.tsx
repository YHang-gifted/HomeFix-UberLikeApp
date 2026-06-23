import { render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { AuditEvent, AuditPage } from '../../../shared/schemas';
import { AuditLogScreen } from './AuditLogScreen';

const ACTOR_ID = '123e4567-e89b-12d3-a456-426614174000';
const RESOURCE_ID = '523e4567-e89b-12d3-a456-426614174000';

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    occurredAt: '2026-06-22T00:00:00.000Z',
    actorId: ACTOR_ID,
    actorRole: 'customer',
    action: 'service_request.created',
    resourceId: RESOURCE_ID,
    ...overrides,
  };
}

function makePage(items: AuditEvent[]): AuditPage {
  return { items, total: items.length, limit: 20, offset: 0 };
}

describe('AuditLogScreen', () => {
  it('renders audit events with a readable action and actor', async () => {
    const listAuditEvents = jest.fn().mockResolvedValue(makePage([makeEvent()]));
    const client = { listAuditEvents } as unknown as ApiClient;

    const { findByText } = await render(<AuditLogScreen client={client} />);

    await findByText('Created request');
    await findByText('by customer');
  });

  it('shows an error message when the request fails', async () => {
    const listAuditEvents = jest.fn().mockRejectedValue(new Error('boom'));
    const client = { listAuditEvents } as unknown as ApiClient;

    const { findByText } = await render(<AuditLogScreen client={client} />);

    await findByText('Could not load the audit log.');
  });
});
