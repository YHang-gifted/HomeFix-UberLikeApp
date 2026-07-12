import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest, ServiceRequestPage } from '../../../shared/schemas';
import { ServiceRequestsScreen } from './ServiceRequestsScreen';

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    customerId: '123e4567-e89b-12d3-a456-426614174000',
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
    ...overrides,
  };
}

function makePage(items: ServiceRequest[]): ServiceRequestPage {
  return { items, total: items.length, limit: 20, offset: 0 };
}

describe('ServiceRequestsScreen', () => {
  it('renders the fetched service requests', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const client = { listServiceRequests } as unknown as ApiClient;

    const { findByText } = await render(<ServiceRequestsScreen client={client} />);

    await findByText('Leaking kitchen sink');
    expect(listServiceRequests).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when the request fails', async () => {
    const listServiceRequests = jest.fn().mockRejectedValue(new Error('network down'));
    const client = { listServiceRequests } as unknown as ApiClient;

    const { findByText } = await render(<ServiceRequestsScreen client={client} />);

    await findByText('Could not load your requests.');
  });

  it('calls onSelectRequest with the id when a card is tapped', async () => {
    const request = makeRequest();
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([request]));
    const client = { listServiceRequests } as unknown as ApiClient;
    const onSelectRequest = jest.fn();

    const { findByText, getByLabelText } = await render(
      <ServiceRequestsScreen client={client} onSelectRequest={onSelectRequest} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('View request: Leaking kitchen sink'));

    expect(onSelectRequest).toHaveBeenCalledWith(request.id);
  });

  it('calls onLogout when the log out button is pressed', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([]));
    const client = { listServiceRequests } as unknown as ApiClient;
    const onLogout = jest.fn();

    const { getByLabelText } = await render(
      <ServiceRequestsScreen client={client} onLogout={onLogout} />,
    );
    await fireEvent.press(getByLabelText('Log out'));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('refetches with a status filter when a chip is pressed', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const client = { listServiceRequests } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ServiceRequestsScreen client={client} />);
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('Filter pending'));

    await waitFor(() => {
      expect(listServiceRequests).toHaveBeenCalledWith({
        status: 'pending',
        q: undefined,
        limit: 20,
        offset: 0,
      });
    });
  });

  it('refetches when the list is pulled to refresh', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const client = { listServiceRequests } as unknown as ApiClient;

    const { findByText, getByTestId } = await render(<ServiceRequestsScreen client={client} />);
    await findByText('Leaking kitchen sink');
    expect(listServiceRequests).toHaveBeenCalledTimes(1);

    await fireEvent(getByTestId('request-list'), 'refresh');

    await waitFor(() => {
      expect(listServiceRequests).toHaveBeenCalledTimes(2);
    });
  });

  it('refetches with a description keyword when the user types in the search box', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const client = { listServiceRequests } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ServiceRequestsScreen client={client} />);
    await findByText('Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Search description'), 'sink');

    await waitFor(() => {
      expect(listServiceRequests).toHaveBeenCalledWith({
        status: undefined,
        q: 'sink',
        limit: 20,
        offset: 0,
      });
    });
  });

  it('loads the next page when "Load more" is pressed', async () => {
    const first = makeRequest({
      id: '123e4567-e89b-12d3-a456-426614174001',
      description: 'First job',
    });
    const second = makeRequest({
      id: '123e4567-e89b-12d3-a456-426614174002',
      description: 'Second job',
    });
    const listServiceRequests = jest
      .fn()
      .mockResolvedValueOnce({ items: [first], total: 2, limit: 20, offset: 0 })
      .mockResolvedValueOnce({ items: [second], total: 2, limit: 20, offset: 1 });
    const client = { listServiceRequests } as unknown as ApiClient;

    const { findByText, getByLabelText, queryByLabelText } = await render(
      <ServiceRequestsScreen client={client} />,
    );
    await findByText('First job');
    await fireEvent.press(getByLabelText('Load more'));

    await findByText('Second job');
    expect(listServiceRequests).toHaveBeenNthCalledWith(2, {
      status: undefined,
      q: undefined,
      limit: 20,
      offset: 1,
    });
    await waitFor(() => {
      expect(queryByLabelText('Load more')).toBeNull();
    });
  });
});
