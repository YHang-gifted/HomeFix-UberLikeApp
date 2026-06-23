import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest, ServiceRequestPage } from '../../../shared/schemas';
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
    ...overrides,
  };
}

function makePage(items: ServiceRequest[]): ServiceRequestPage {
  return { items, total: items.length, limit: 20, offset: 0 };
}

describe('WorkerJobsScreen', () => {
  it('renders assigned jobs with the next worker action', async () => {
    const listServiceRequests = jest.fn().mockResolvedValue(makePage([makeJob()]));
    const updateServiceRequestStatus = jest.fn();
    const client = { listServiceRequests, updateServiceRequestStatus } as unknown as ApiClient;

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
    const client = { listServiceRequests, updateServiceRequestStatus } as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<WorkerJobsScreen client={client} />);
    await findByText('Accept job');
    await fireEvent.press(getByLabelText('Accept job'));

    await findByText('Start work');
    expect(updateServiceRequestStatus).toHaveBeenCalledWith(job.id, 'accepted');
  });
});
