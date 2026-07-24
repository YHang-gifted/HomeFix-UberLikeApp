import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// Slice 3 of the refund flow: the owning customer requests a refund on a paid payment and sees its
// status. Settlement/approval is admin-side; this screen only files the request and reflects state.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OWNER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeRequest(): ServiceRequest {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'completed',
    workerId: WORKER_ID,
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
  };
}

function paidPayment(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174777',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 150000,
    currency: 'USD',
    status: 'paid',
    provider: 'stripe',
    createdAt: '2026-06-22T00:00:00.000Z',
    paidAt: '2026-06-22T01:00:00.000Z',
    ...overrides,
  };
}

function makeRefundRequest(overrides = {}) {
  return {
    id: '723e4567-e89b-12d3-a456-426614174000',
    requestId: REQUEST_ID,
    paymentId: '623e4567-e89b-12d3-a456-426614174777',
    customerId: CUSTOMER_ID,
    reason: 'Work was not completed',
    status: 'open',
    createdAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}

function clientWith(extra: Record<string, unknown>, principal: Principal = OWNER) {
  return {
    getPrincipal: jest.fn().mockReturnValue(principal),
    getServiceRequest: jest.fn().mockResolvedValue(makeRequest()),
    getPayment: jest.fn().mockResolvedValue(paidPayment()),
    getRefundRequest: jest.fn().mockRejectedValue(new Error('none')),
    ...extra,
  } as unknown as ApiClient;
}

describe('RequestDetailScreen — customer refund request', () => {
  it('files a refund request and then shows its status', async () => {
    const requestRefund = jest.fn().mockResolvedValue(makeRefundRequest());
    const client = clientWith({ requestRefund });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Refund reason'), 'Work was not completed');
    await fireEvent.press(await findByLabelText('Request refund'));

    await waitFor(() => {
      expect(requestRefund).toHaveBeenCalledWith(REQUEST_ID, 'Work was not completed');
    });
    await findByText(/awaiting review/i);
  });

  it('does not file with an empty reason', async () => {
    const requestRefund = jest.fn();
    const client = clientWith({ requestRefund });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await fireEvent.press(await findByLabelText('Request refund'));
    await findByText(/say why you want a refund/i);
    expect(requestRefund).not.toHaveBeenCalled();
  });

  it('shows a declined refund request with its reason and lets the customer re-file (appeal)', async () => {
    const requestRefund = jest
      .fn()
      .mockResolvedValue(makeRefundRequest({ status: 'open', reason: 'Leak came back' }));
    const client = clientWith({
      getRefundRequest: jest
        .fn()
        .mockResolvedValue(
          makeRefundRequest({ status: 'rejected', resolutionNote: 'The work was completed.' }),
        ),
      requestRefund,
    });

    const { findByText, findByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText(/declined/i);
    await findByText('The work was completed.');

    // The appeal path: the re-file form is offered again, and filing calls requestRefund.
    await fireEvent.changeText(await findByLabelText('Refund reason'), 'Leak came back');
    await fireEvent.press(await findByLabelText('Request refund'));
    await waitFor(() => {
      expect(requestRefund).toHaveBeenCalledWith(REQUEST_ID, 'Leak came back');
    });
  });

  it('hides the refund UI when the payment is not paid', async () => {
    const client = clientWith({
      getPayment: jest
        .fn()
        .mockResolvedValue(paidPayment({ status: 'pending', paidAt: undefined })),
    });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText('Pending');
    expect(queryByLabelText('Request refund')).toBeNull();
  });
});
