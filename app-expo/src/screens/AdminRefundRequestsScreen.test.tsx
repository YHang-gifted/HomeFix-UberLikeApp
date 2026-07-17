import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { AdminRefundRequestsScreen } from './AdminRefundRequestsScreen';

function makeRefundRequest(overrides = {}) {
  return {
    id: '723e4567-e89b-12d3-a456-426614174001',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    paymentId: '623e4567-e89b-12d3-a456-426614174777',
    customerId: '123e4567-e89b-12d3-a456-426614174000',
    reason: 'Work was not completed',
    status: 'open',
    createdAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

const RR_ID = '723e4567-e89b-12d3-a456-426614174001';

function clientWith(extra: Record<string, unknown>) {
  return { listRefundRequests: jest.fn().mockResolvedValue([]), ...extra } as unknown as ApiClient;
}

describe('AdminRefundRequestsScreen', () => {
  it('lists open requests and approves one, removing it from the queue', async () => {
    const listRefundRequests = jest.fn().mockResolvedValue([makeRefundRequest()]);
    const resolveRefundRequest = jest
      .fn()
      .mockResolvedValue(makeRefundRequest({ status: 'approved' }));
    const client = clientWith({ listRefundRequests, resolveRefundRequest });

    const { findByText, findByLabelText, queryByText } = await render(
      <AdminRefundRequestsScreen client={client} />,
    );

    await findByText(/Work was not completed/);
    await fireEvent.press(await findByLabelText(`Approve refund ${RR_ID}`));

    await waitFor(() => {
      expect(resolveRefundRequest).toHaveBeenCalledWith(RR_ID, 'approve', undefined);
    });
    await waitFor(() => {
      expect(queryByText(/Work was not completed/)).toBeNull();
    });
  });

  it('rejects with a note', async () => {
    const resolveRefundRequest = jest
      .fn()
      .mockResolvedValue(makeRefundRequest({ status: 'rejected' }));
    const client = clientWith({
      listRefundRequests: jest.fn().mockResolvedValue([makeRefundRequest()]),
      resolveRefundRequest,
    });

    const { findByLabelText } = await render(<AdminRefundRequestsScreen client={client} />);

    await fireEvent.changeText(
      await findByLabelText(`Resolution note for ${RR_ID}`),
      'Work was completed as agreed.',
    );
    await fireEvent.press(await findByLabelText(`Reject refund ${RR_ID}`));

    await waitFor(() => {
      expect(resolveRefundRequest).toHaveBeenCalledWith(
        RR_ID,
        'reject',
        'Work was completed as agreed.',
      );
    });
  });

  it('requires a note to reject', async () => {
    const resolveRefundRequest = jest.fn();
    const client = clientWith({
      listRefundRequests: jest.fn().mockResolvedValue([makeRefundRequest()]),
      resolveRefundRequest,
    });

    const { findByText, findByLabelText } = await render(
      <AdminRefundRequestsScreen client={client} />,
    );

    await fireEvent.press(await findByLabelText(`Reject refund ${RR_ID}`));
    await findByText('Enter a reason to reject.');
    expect(resolveRefundRequest).not.toHaveBeenCalled();
  });

  it('shows an empty state when the queue is empty', async () => {
    const { findByText } = await render(<AdminRefundRequestsScreen client={clientWith({})} />);
    await findByText('No refund requests awaiting review.');
  });
});
