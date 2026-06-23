import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: '523e4567-e89b-12d3-a456-426614174000',
    customerId: '123e4567-e89b-12d3-a456-426614174000',
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('RequestDetailScreen', () => {
  it('renders the request and offers cancel for a non-terminal request', async () => {
    const request = makeRequest({ status: 'pending' });
    const getServiceRequest = jest.fn().mockResolvedValue(request);
    const updateServiceRequestStatus = jest.fn();
    const client = { getServiceRequest, updateServiceRequestStatus } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Leaking kitchen sink');
    getByLabelText('Cancel request');
  });

  it('cancels the request and calls onCancelled', async () => {
    const request = makeRequest({ status: 'pending' });
    const getServiceRequest = jest.fn().mockResolvedValue(request);
    const updateServiceRequestStatus = jest
      .fn()
      .mockResolvedValue({ ...request, status: 'cancelled' });
    const client = { getServiceRequest, updateServiceRequestStatus } as unknown as ApiClient;
    const onCancelled = jest.fn();

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} onCancelled={onCancelled} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('Cancel request'));

    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalledTimes(1);
    });
    expect(updateServiceRequestStatus).toHaveBeenCalledWith(request.id, 'cancelled');
  });

  it('hides cancel for a completed request', async () => {
    const getServiceRequest = jest.fn().mockResolvedValue(makeRequest({ status: 'completed' }));
    const client = { getServiceRequest } as unknown as ApiClient;

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId="523e4567-e89b-12d3-a456-426614174000" client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByLabelText('Cancel request')).toBeNull();
  });

  it('shows the requested timestamp label and the assigned worker', async () => {
    const request = makeRequest({
      status: 'matched',
      workerId: '423e4567-e89b-12d3-a456-426614174000',
    });
    const getServiceRequest = jest.fn().mockResolvedValue(request);
    const client = { getServiceRequest } as unknown as ApiClient;

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Requested');
    await findByText('423e4567-e89b-12d3-a456-426614174000');
  });

  it('submits a review for a completed request', async () => {
    const request = makeRequest({ status: 'completed' });
    const getServiceRequest = jest.fn().mockResolvedValue(request);
    const createReview = jest
      .fn()
      .mockResolvedValue({ id: 'r1', requestId: request.id, rating: 5 });
    const client = { getServiceRequest, createReview } as unknown as ApiClient;

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
    const getServiceRequest = jest.fn().mockResolvedValue(request);
    const createReview = jest.fn().mockRejectedValue(new ApiError(409, 'already reviewed'));
    const client = { getServiceRequest, createReview } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Rate the worker');
    await fireEvent.press(getByLabelText('Rate 4'));
    await fireEvent.press(getByLabelText('Submit review'));

    await findByText('You have already reviewed this request.');
  });
});
