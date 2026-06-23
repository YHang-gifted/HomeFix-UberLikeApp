import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type {
  ServiceRequest,
  ServiceRequestPage,
  WorkerReviews,
  WorkerSummary,
} from '../../../shared/schemas';
import { AdminRequestsScreen } from './AdminRequestsScreen';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const WORKERS: WorkerSummary[] = [{ id: WORKER_ID, email: 'worker@homefix.test' }];

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

function makeReviews(overrides: Partial<WorkerReviews> = {}): WorkerReviews {
  return { workerId: WORKER_ID, reviewCount: 0, averageRating: 0, items: [], ...overrides };
}

function baseClient(extra: Record<string, unknown>) {
  return {
    listWorkers: jest.fn().mockResolvedValue(WORKERS),
    getWorkerReviews: jest.fn().mockResolvedValue(makeReviews()),
    ...extra,
  };
}

describe('AdminRequestsScreen', () => {
  it('shows an assign action for a pending request', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const assignWorker = jest.fn();
    const client = baseClient({ listServiceRequests, assignWorker }) as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<AdminRequestsScreen client={client} />);

    await findByText('Leaking kitchen sink');
    getByLabelText('Assign to worker@homefix.test');
  });

  it('assigns a worker when the action is pressed', async () => {
    const request = makeRequest({ status: 'pending' });
    const listServiceRequests = jest
      .fn()
      .mockResolvedValueOnce(makePage([request]))
      .mockResolvedValueOnce(makePage([{ ...request, status: 'matched', workerId: WORKER_ID }]));
    const assignWorker = jest
      .fn()
      .mockResolvedValue({ ...request, status: 'matched', workerId: WORKER_ID });
    const client = baseClient({ listServiceRequests, assignWorker }) as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<AdminRequestsScreen client={client} />);
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('Assign to worker@homefix.test'));

    await waitFor(() => {
      expect(assignWorker).toHaveBeenCalledWith(request.id, WORKER_ID);
    });
  });

  it('does not show an assign action for a non-pending request', async () => {
    const listServiceRequests = jest
      .fn()
      .mockResolvedValue(makePage([makeRequest({ status: 'matched', workerId: WORKER_ID })]));
    const client = baseClient({ listServiceRequests }) as unknown as ApiClient;

    const { findByText, queryByLabelText } = await render(<AdminRequestsScreen client={client} />);
    await findByText('Leaking kitchen sink');
    expect(queryByLabelText('Assign to worker@homefix.test')).toBeNull();
  });

  it('shows the worker rating next to the assign action', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const getWorkerReviews = jest
      .fn()
      .mockResolvedValue(makeReviews({ reviewCount: 2, averageRating: 4.5 }));
    const client = baseClient({ listServiceRequests, getWorkerReviews }) as unknown as ApiClient;

    const { findByText } = await render(<AdminRequestsScreen client={client} />);

    await findByText('4.5 ★ (2)');
  });

  it('calls onSelectRequest when a request card is tapped', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeRequest()]));
    const client = baseClient({ listServiceRequests }) as unknown as ApiClient;
    const onSelectRequest = jest.fn();

    const { findByText, getByLabelText } = await render(
      <AdminRequestsScreen client={client} onSelectRequest={onSelectRequest} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('View request: Leaking kitchen sink'));

    expect(onSelectRequest).toHaveBeenCalledWith('523e4567-e89b-12d3-a456-426614174000');
  });
});
