import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { LiveMapProps } from '../../../app/src/features/tracking/liveMap';
import type { LiveLocation, Principal, ServiceRequest } from '../../../shared/schemas';
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

  it('starts background tracking for the assigned worker while en route', async () => {
    const enRoute = makeRequest({
      status: 'in_progress',
      enRouteAt: '2030-08-01T14:00:00.000Z',
      enRouteEtaMinutes: 18,
    });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(enRoute) }, WORKER);
    const start = jest.fn().mockResolvedValue(undefined);
    const backgroundTracker = { start, stop: jest.fn().mockResolvedValue(undefined) };

    await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        backgroundTracker={backgroundTracker}
      />,
    );

    await waitFor(() => {
      expect(start).toHaveBeenCalledWith(REQUEST_ID);
    });
  });

  it('does not start background tracking before the worker is en route', async () => {
    // A confirmed visit the worker has NOT set out for (no enRouteAt) must not stream a location.
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(makeRequest()) },
      WORKER,
    );
    const start = jest.fn().mockResolvedValue(undefined);
    const backgroundTracker = { start, stop: jest.fn().mockResolvedValue(undefined) };

    const { findByText } = await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        backgroundTracker={backgroundTracker}
      />,
    );

    // Wait until the request has loaded and rendered (so the tracking effect has had its chance).
    await findByText('Leaking sink');
    expect(start).not.toHaveBeenCalled();
  });

  it('shows the customer the worker live location once a position arrives', async () => {
    const enRoute = makeRequest({
      status: 'in_progress',
      enRouteAt: '2030-08-01T14:00:00.000Z',
      enRouteEtaMinutes: 18,
    });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(enRoute) },
      CUSTOMER,
    );
    let emitLoc: ((location: LiveLocation) => void) | undefined;
    const connectLocationStream = (
      _requestId: string,
      onLocation: (location: LiveLocation) => void,
    ) => {
      emitLoc = onLocation;
      return { close: () => undefined };
    };

    const { findByText, queryByText } = await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        connectLocationStream={connectLocationStream}
      />,
    );

    await waitFor(() => {
      expect(emitLoc).toBeDefined();
    });
    // Nothing shown until a position arrives.
    expect(queryByText(/updating live/i)).toBeNull();
    emitLoc?.({
      requestId: REQUEST_ID,
      latitude: 40.7,
      longitude: -74,
      at: '2030-08-01T14:01:00.000Z',
    });
    await findByText(/updating live/i);
  });

  it('draws the worker position on the injected live map, headed to the job site', async () => {
    const enRoute = makeRequest({
      status: 'in_progress',
      enRouteAt: '2030-08-01T14:00:00.000Z',
      enRouteEtaMinutes: 18,
    });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(enRoute) },
      CUSTOMER,
    );
    let emitLoc: ((location: LiveLocation) => void) | undefined;
    const connectLocationStream = (
      _requestId: string,
      onLocation: (location: LiveLocation) => void,
    ) => {
      emitLoc = onLocation;
      return { close: () => undefined };
    };
    const liveMap = ({ worker, destination }: LiveMapProps) => (
      <Text>{`map ${worker.latitude},${worker.longitude} -> ${destination.latitude},${destination.longitude}`}</Text>
    );

    const { findByText } = await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        connectLocationStream={connectLocationStream}
        liveMap={liveMap}
      />,
    );

    await waitFor(() => {
      expect(emitLoc).toBeDefined();
    });
    emitLoc?.({
      requestId: REQUEST_ID,
      latitude: 40.7,
      longitude: -74,
      at: '2030-08-01T14:01:00.000Z',
    });
    // The map gets the live worker position and the request's location as the destination.
    await findByText('map 40.7,-74 -> 40.7128,-74.006');
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
