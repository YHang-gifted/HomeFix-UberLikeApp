import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// Live-tracking Phase 1 (app): the assigned worker sets out ("On my way") for a confirmed visit,
// which sends their location for a rough ETA and shows the customer an "on the way" line.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const WORKER: Principal = { id: WORKER_ID, role: 'worker' };
const CUSTOMER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeRequest(overrides = {}): ServiceRequest {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    category: 'plumbing',
    description: 'Leaking sink',
    location: { latitude: 40.7128, longitude: -74.006 },
    status: 'accepted',
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'confirmed',
    scheduledAt: '2030-08-01T14:30:00.000Z',
    scheduleProposedBy: 'customer',
    ...overrides,
  };
}

function clientWith(extra: Record<string, unknown>, principal: Principal) {
  return {
    getPrincipal: jest.fn().mockReturnValue(principal),
    getServiceRequest: jest.fn().mockResolvedValue(makeRequest()),
    ...extra,
  } as unknown as ApiClient;
}

describe('RequestDetailScreen — worker on my way', () => {
  it('lets the assigned worker set out, sending a location, then shows the on-the-way line', async () => {
    const enRoute = makeRequest({ enRouteAt: '2030-08-01T14:00:00.000Z', enRouteEtaMinutes: 18 });
    const markEnRoute = jest.fn().mockResolvedValue(enRoute);
    const client = clientWith({ markEnRoute }, WORKER);
    const locationProvider = {
      getCurrentPosition: () => Promise.resolve({ latitude: 40.7, longitude: -74 }),
    };

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        locationProvider={locationProvider}
      />,
    );

    await fireEvent.press(await findByLabelText('On my way'));
    await waitFor(() => {
      expect(markEnRoute).toHaveBeenCalledWith(REQUEST_ID, { latitude: 40.7, longitude: -74 });
    });
    await findByText(/on the way/i);
  });

  it('streams the assigned worker location while en route', async () => {
    const enRoute = makeRequest({
      status: 'in_progress',
      enRouteAt: '2030-08-01T14:00:00.000Z',
      enRouteEtaMinutes: 18,
    });
    const publishLocation = jest.fn().mockResolvedValue({});
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(enRoute), publishLocation },
      WORKER,
    );
    let emit: ((coords: { latitude: number; longitude: number }) => void) | undefined;
    const locationWatcher = {
      watch: (onUpdate: (coords: { latitude: number; longitude: number }) => void) => {
        emit = onUpdate;
        return Promise.resolve(() => undefined);
      },
    };

    await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        locationWatcher={locationWatcher}
      />,
    );

    await waitFor(() => {
      expect(emit).toBeDefined();
    });
    emit?.({ latitude: 40.7, longitude: -74 });
    await waitFor(() => {
      expect(publishLocation).toHaveBeenCalledWith(REQUEST_ID, { latitude: 40.7, longitude: -74 });
    });
  });

  it('shows the customer an on-the-way line with the ETA and no action', async () => {
    const enRoute = makeRequest({ enRouteAt: '2030-08-01T14:00:00.000Z', enRouteEtaMinutes: 18 });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(enRoute) },
      CUSTOMER,
    );

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText(/on the way/i);
    await findByText(/18 min/);
    expect(queryByLabelText('On my way')).toBeNull();
  });
});
