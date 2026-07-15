import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { type ApiClient, ApiError } from '../../../app/src/services/apiClient';
import type { OpenDateTimePicker } from '../../../app/src/features/schedule/dateTimePicker';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// slice 175: the visit-time negotiation in the app. Either party proposes; only the OTHER
// party sees a Confirm action. Kept in its own file — RequestDetailScreen.test.tsx is already
// ~1000 lines.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';

const CUSTOMER: Principal = { id: CUSTOMER_ID, role: 'customer' };
const WORKER: Principal = { id: WORKER_ID, role: 'worker' };

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'matched',
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
    ...overrides,
  };
}

/** The screen also loads a quote and a payment; neither exists in these scenarios. */
function clientWith(extra: Record<string, unknown>, principal: Principal) {
  return {
    getPrincipal: jest.fn().mockReturnValue(principal),
    getQuote: jest.fn().mockRejectedValue(new ApiError(404, 'no quote')),
    getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
    ...extra,
  } as unknown as ApiClient;
}

/** The propose field/button only render when a picker is injected — default to an inert one. */
function screenFor(
  client: ApiClient,
  openDateTimePicker: OpenDateTimePicker = () => Promise.resolve(null),
) {
  return render(
    <RequestDetailScreen
      requestId={REQUEST_ID}
      client={client}
      mapPreviewUrl={() => null}
      openDateTimePicker={openDateTimePicker}
    />,
  );
}

describe('RequestDetailScreen visit scheduling', () => {
  it('lets the worker confirm the time the customer proposed', async () => {
    const request = makeRequest({
      scheduledAt: '2030-08-01T14:30:00.000Z',
      scheduleStatus: 'proposed',
      scheduleProposedBy: 'customer',
    });
    const confirmSchedule = jest
      .fn()
      .mockResolvedValue({ ...request, scheduleStatus: 'confirmed' });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request), confirmSchedule },
      WORKER,
    );

    const { findByLabelText, findByText } = await screenFor(client);

    await fireEvent.press(await findByLabelText('Confirm this time'));
    await waitFor(() => {
      expect(confirmSchedule).toHaveBeenCalledWith(REQUEST_ID);
    });
    await findByText(/Confirmed for/);
  });

  it('does not offer Confirm to the party who proposed the time', async () => {
    const request = makeRequest({
      scheduledAt: '2030-08-01T14:30:00.000Z',
      scheduleStatus: 'proposed',
      scheduleProposedBy: 'customer',
    });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request) },
      CUSTOMER,
    );

    const { findByText, queryByLabelText } = await screenFor(client);

    await findByText(/You proposed/);
    expect(queryByLabelText('Confirm this time')).toBeNull();
    // They can still suggest a different time.
    expect(queryByLabelText('Propose a time')).not.toBeNull();
  });

  // slice 191: the time is chosen from the picker, not typed. The screen sends the picked Date
  // as ISO. (The old "malformed time" case is gone — the picker cannot produce an invalid time.)
  it('proposes the picked time, sending it to the API as ISO', async () => {
    const request = makeRequest();
    const proposeSchedule = jest.fn().mockResolvedValue({
      ...request,
      scheduledAt: '2030-08-01T14:30:00.000Z',
      scheduleStatus: 'proposed',
      scheduleProposedBy: 'worker',
    });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request), proposeSchedule },
      WORKER,
    );

    const chosen = new Date(2030, 7, 1, 14, 30); // 1 Aug 2030, 14:30 local
    const openDateTimePicker = jest.fn().mockResolvedValue(chosen);

    const { findByLabelText, findByText } = await screenFor(client, openDateTimePicker);

    await fireEvent.press(await findByLabelText('Proposed visit time'));
    await findByText(/2030/); // the chosen time now shows on the field
    await fireEvent.press(await findByLabelText('Propose a time'));

    await waitFor(() => {
      expect(proposeSchedule).toHaveBeenCalledTimes(1);
    });
    expect(proposeSchedule).toHaveBeenCalledWith(REQUEST_ID, chosen.toISOString());
  });

  it('offers a reschedule once the time is confirmed', async () => {
    const request = makeRequest({
      scheduledAt: '2030-08-01T14:30:00.000Z',
      scheduleStatus: 'confirmed',
      scheduleProposedBy: 'customer',
    });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(request) }, WORKER);

    const { findByLabelText, queryByLabelText } = await screenFor(client);

    await findByLabelText('Propose a new time');
    expect(queryByLabelText('Confirm this time')).toBeNull();
  });
});
