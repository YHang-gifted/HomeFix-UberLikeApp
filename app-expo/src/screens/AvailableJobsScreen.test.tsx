import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest, ServiceRequestPage } from '../../../shared/schemas';
import { AvailableJobsScreen } from './AvailableJobsScreen';

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

function makePage(items: ServiceRequest[]): ServiceRequestPage {
  return { items, total: items.length, limit: 20, offset: 0 };
}

function clientWith(extra: Record<string, unknown>) {
  return { listUsers: jest.fn().mockResolvedValue([]), ...extra } as unknown as ApiClient;
}

describe('AvailableJobsScreen', () => {
  it('lists available jobs', async () => {
    const client = clientWith({
      listAvailableRequests: jest.fn().mockResolvedValue(makePage([makeRequest()])),
    });

    const { findByText } = await render(<AvailableJobsScreen client={client} />);

    await findByText('Leaking kitchen sink');
  });

  it('shows an empty state when nothing is available', async () => {
    const client = clientWith({
      listAvailableRequests: jest.fn().mockResolvedValue(makePage([])),
    });

    const { findByText } = await render(<AvailableJobsScreen client={client} />);

    await findByText('No jobs available right now. Check back soon.');
  });

  it('claims a job, reloads, and notifies the caller', async () => {
    const listAvailableRequests = jest
      .fn()
      .mockResolvedValueOnce(makePage([makeRequest()]))
      .mockResolvedValueOnce(makePage([]));
    const claimRequest = jest
      .fn()
      .mockResolvedValue(makeRequest({ status: 'matched', workerId: 'w1' }));
    const client = clientWith({ listAvailableRequests, claimRequest });
    const onClaimed = jest.fn();

    const { findByLabelText, findByText } = await render(
      <AvailableJobsScreen client={client} onClaimed={onClaimed} />,
    );

    await fireEvent.press(await findByLabelText('Claim job: Leaking kitchen sink'));

    await waitFor(() => {
      expect(claimRequest).toHaveBeenCalledWith('523e4567-e89b-12d3-a456-426614174000');
    });
    expect(onClaimed).toHaveBeenCalledWith('523e4567-e89b-12d3-a456-426614174000');
    await findByText('No jobs available right now. Check back soon.');
  });
});
