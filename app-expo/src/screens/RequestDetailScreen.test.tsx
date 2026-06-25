import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const OWNER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function clientWith(extra: Record<string, unknown>, principal: Principal = OWNER) {
  return { getPrincipal: jest.fn().mockReturnValue(principal), ...extra } as unknown as ApiClient;
}

describe('RequestDetailScreen', () => {
  it('renders the request and offers cancel for the owner on a non-terminal request', async () => {
    const request = makeRequest({ status: 'pending' });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      updateServiceRequestStatus: jest.fn(),
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Leaking kitchen sink');
    getByLabelText('Cancel request');
  });

  it('shows photos when the request has photo URLs', async () => {
    const request = makeRequest({ photoUrls: ['https://example.com/a.jpg'] });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(request) });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Photos');
    getByLabelText('Request photo');
  });

  it('shows the activity timeline from the request history', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const history = [
      {
        id: '623e4567-e89b-12d3-a456-426614174001',
        occurredAt: '2026-06-22T00:00:00.000Z',
        actorId: CUSTOMER_ID,
        actorRole: 'customer',
        action: 'service_request.created',
        resourceId: request.id,
      },
      {
        id: '623e4567-e89b-12d3-a456-426614174002',
        occurredAt: '2026-06-22T01:00:00.000Z',
        actorId: WORKER_ID,
        actorRole: 'worker',
        action: 'service_request.status_changed',
        resourceId: request.id,
        details: { from: 'matched', to: 'accepted' },
      },
    ];
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getRequestHistory: jest.fn().mockResolvedValue(history),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Activity');
    await findByText('Request created');
    await findByText('Status changed to accepted');
  });

  it('cancels the request and calls onCancelled', async () => {
    const request = makeRequest({ status: 'pending' });
    const updateServiceRequestStatus = jest
      .fn()
      .mockResolvedValue({ ...request, status: 'cancelled' });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      updateServiceRequestStatus,
    });
    const onCancelled = jest.fn();

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} onCancelled={onCancelled} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('Cancel request'));

    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalledTimes(1);
    });
    expect(updateServiceRequestStatus).toHaveBeenCalledWith(request.id, 'cancelled', undefined);
  });

  it('passes a cancellation reason when one is entered', async () => {
    const request = makeRequest({ status: 'pending' });
    const updateServiceRequestStatus = jest
      .fn()
      .mockResolvedValue({ ...request, status: 'cancelled' });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      updateServiceRequestStatus,
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Cancellation reason'), '  Booked someone else  ');
    await fireEvent.press(getByLabelText('Cancel request'));

    await waitFor(() => {
      expect(updateServiceRequestStatus).toHaveBeenCalledWith(
        request.id,
        'cancelled',
        'Booked someone else',
      );
    });
  });

  it('appends the cancellation reason to the timeline label', async () => {
    const request = makeRequest({ status: 'cancelled' });
    const history = [
      {
        id: '623e4567-e89b-12d3-a456-426614174003',
        occurredAt: '2026-06-22T02:00:00.000Z',
        actorId: CUSTOMER_ID,
        actorRole: 'customer',
        action: 'service_request.status_changed',
        resourceId: request.id,
        details: { from: 'pending', to: 'cancelled', reason: 'Booked someone else' },
      },
    ];
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getRequestHistory: jest.fn().mockResolvedValue(history),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Status changed to cancelled — Booked someone else');
  });

  it('hides cancel for a completed request', async () => {
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(makeRequest({ status: 'completed' })),
    });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId="523e4567-e89b-12d3-a456-426614174000" client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByLabelText('Cancel request')).toBeNull();
  });

  it('shows the requested timestamp label and the assigned worker name', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getWorker: jest.fn().mockResolvedValue({
        id: WORKER_ID,
        email: 'worker@homefix.test',
        displayName: 'Demo Worker',
      }),
      getRequestContacts: jest.fn().mockResolvedValue({ workerPhone: '+1 555 444 5555' }),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Requested');
    await findByText('Demo Worker');
    await findByText('+1 555 444 5555');
  });

  it('shows the ordering customer name to a non-owner (worker/admin)', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const worker: Principal = { id: WORKER_ID, role: 'worker' };
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getUser: jest.fn().mockResolvedValue({
          id: CUSTOMER_ID,
          displayName: 'Demo Customer',
          role: 'customer',
        }),
        getRequestContacts: jest.fn().mockResolvedValue({ customerPhone: '+1 555 222 3333' }),
      },
      worker,
    );

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Customer');
    await findByText('Demo Customer');
    await findByText('+1 555 222 3333');
  });

  it('submits a review for a completed request', async () => {
    const request = makeRequest({ status: 'completed' });
    const createReview = jest
      .fn()
      .mockResolvedValue({ id: 'r1', requestId: request.id, rating: 5 });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      createReview,
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Rate the worker');
    await fireEvent.press(getByLabelText('Rate 5'));
    await fireEvent.press(getByLabelText('Submit review'));

    await findByText('Thanks for your review!');
    expect(createReview).toHaveBeenCalledWith(request.id, { rating: 5 });
  });

  it('shows an already-reviewed message on a 409', async () => {
    const request = makeRequest({ status: 'completed' });
    const createReview = jest.fn().mockRejectedValue(new ApiError(409, 'already reviewed'));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      createReview,
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Rate the worker');
    await fireEvent.press(getByLabelText('Rate 4'));
    await fireEvent.press(getByLabelText('Submit review'));

    await findByText('You have already reviewed this request.');
  });

  it('hides owner actions from a non-owner (worker) viewer', async () => {
    const request = makeRequest({ status: 'completed', workerId: WORKER_ID });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request) },
      { id: WORKER_ID, role: 'worker' },
    );

    const { findByText, queryByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByText('Rate the worker')).toBeNull();
    expect(queryByLabelText('Cancel request')).toBeNull();
  });
});
