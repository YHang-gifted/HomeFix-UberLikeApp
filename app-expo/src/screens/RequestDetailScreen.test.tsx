import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
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
});
