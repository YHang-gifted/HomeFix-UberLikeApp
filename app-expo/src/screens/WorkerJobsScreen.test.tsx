import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest, ServiceRequestPage, WorkerReviews } from '../../../shared/schemas';
import { WorkerJobsScreen } from './WorkerJobsScreen';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeJob(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: '523e4567-e89b-12d3-a456-426614174000',
    customerId: '123e4567-e89b-12d3-a456-426614174000',
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

function makePage(items: ServiceRequest[]): ServiceRequestPage {
  return { items, total: items.length, limit: 20, offset: 0 };
}

function makeReviews(overrides: Partial<WorkerReviews> = {}): WorkerReviews {
  return { workerId: WORKER_ID, reviewCount: 0, averageRating: 0, items: [], ...overrides };
}

function baseClient(extra: Record<string, unknown>) {
  return {
    getPrincipal: jest.fn().mockReturnValue({ id: WORKER_ID, role: 'worker' }),
    getWorkerReviews: jest.fn().mockResolvedValue(makeReviews()),
    listUsers: jest.fn().mockResolvedValue([]),
    ...extra,
  };
}

describe('WorkerJobsScreen', () => {
  it('renders assigned jobs with the next worker action', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeJob()]));
    const updateServiceRequestStatus = jest.fn();
    const client = baseClient({
      listServiceRequests,
      updateServiceRequestStatus,
    }) as unknown as ApiClient;

    const { findByText } = await render(<WorkerJobsScreen client={client} />);

    await findByText('Leaking kitchen sink');
    await findByText('Accept job');
  });

  it('advances a job to the next status when the action is pressed', async () => {
    const job = makeJob({ status: 'matched' });
    const listServiceRequests = jest
      .fn()
      .mockResolvedValueOnce(makePage([job]))
      .mockResolvedValueOnce(makePage([{ ...job, status: 'accepted' }]));
    const updateServiceRequestStatus = jest.fn().mockResolvedValue({ ...job, status: 'accepted' });
    const client = baseClient({
      listServiceRequests,
      updateServiceRequestStatus,
    }) as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<WorkerJobsScreen client={client} />);
    await findByText('Accept job');
    await fireEvent.press(getByLabelText('Accept job'));

    await findByText('Start work');
    expect(updateServiceRequestStatus).toHaveBeenCalledWith(job.id, 'accepted');
  });

  it('shows the worker average rating', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([]));
    const getWorkerReviews = jest
      .fn()
      .mockResolvedValue(makeReviews({ reviewCount: 2, averageRating: 4.5 }));
    const client = baseClient({ listServiceRequests, getWorkerReviews }) as unknown as ApiClient;

    const { findByText } = await render(<WorkerJobsScreen client={client} />);

    await findByText('4.5 ★ (2 reviews)');
  });

  it('calls onSelectRequest when a job card is tapped', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeJob()]));
    const client = baseClient({ listServiceRequests }) as unknown as ApiClient;
    const onSelectRequest = jest.fn();

    const { findByText, getByLabelText } = await render(
      <WorkerJobsScreen client={client} onSelectRequest={onSelectRequest} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('View job: Leaking kitchen sink'));

    expect(onSelectRequest).toHaveBeenCalledWith('523e4567-e89b-12d3-a456-426614174000');
  });

  it('calls onViewPayments when the Payments header button is tapped', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([]));
    const client = baseClient({ listServiceRequests }) as unknown as ApiClient;
    const onViewPayments = jest.fn();

    const { getByLabelText } = await render(
      <WorkerJobsScreen client={client} onViewPayments={onViewPayments} />,
    );
    await fireEvent.press(getByLabelText('Payments'));

    expect(onViewPayments).toHaveBeenCalledTimes(1);
  });
});
