import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// On-site scope change (slice 211, UI): the assigned worker proposes a revised total for extra work
// found on site. The quote goes back to pending and the customer agrees through the ordinary
// accept flow, so nothing else in the screen changes.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const WORKER: Principal = { id: WORKER_ID, role: 'worker' };

function makeRequest(): ServiceRequest {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'The kitchen sink is blocked',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'in_progress',
    workerId: WORKER_ID,
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
  };
}

function acceptedQuote(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174888',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 12000,
    currency: 'USD',
    status: 'accepted',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function paidPayment() {
  return {
    id: '723e4567-e89b-12d3-a456-426614174777',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 12000,
    currency: 'USD',
    status: 'paid',
    createdAt: '2026-06-22T00:00:00.000Z',
    paidAt: '2026-06-22T01:00:00.000Z',
  };
}

function clientWith(extra: Record<string, unknown>, principal: Principal = WORKER) {
  return {
    getPrincipal: jest.fn().mockReturnValue(principal),
    getServiceRequest: jest.fn().mockResolvedValue(makeRequest()),
    getQuote: jest.fn().mockResolvedValue(acceptedQuote()),
    getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
    ...extra,
  } as unknown as ApiClient;
}

describe('RequestDetailScreen — on-site scope change', () => {
  it('lets the assigned worker propose a revised price', async () => {
    const reviseQuote = jest
      .fn()
      .mockResolvedValue(
        acceptedQuote({ status: 'pending', amountCents: 25000, note: 'Corroded' }),
      );
    const client = clientWith({ reviseQuote });

    const { findByLabelText, getByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Revised amount'), '250');
    await fireEvent.changeText(getByLabelText('Revision reason'), 'Corroded pipe had to go');
    await fireEvent.press(getByLabelText('Revise price'));

    await waitFor(() => {
      expect(reviseQuote).toHaveBeenCalledWith(REQUEST_ID, {
        amountCents: 25000,
        reason: 'Corroded pipe had to go',
      });
    });
  });

  it('requires a reason before calling the API', async () => {
    const reviseQuote = jest.fn();
    const client = clientWith({ reviseQuote });

    const { findByLabelText, getByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Revised amount'), '250');
    await fireEvent.press(getByLabelText('Revise price'));

    await findByText('Say what the extra work is.');
    expect(reviseQuote).not.toHaveBeenCalled();
  });

  it('hides the revision form once the payment has settled', async () => {
    const client = clientWith({ getPayment: jest.fn().mockResolvedValue(paidPayment()) });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText('Paid');
    expect(queryByLabelText('Revise price')).toBeNull();
  });

  it('does not offer a revision to the customer', async () => {
    const client = clientWith({}, { id: CUSTOMER_ID, role: 'customer' });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText('Accepted');
    expect(queryByLabelText('Revise price')).toBeNull();
  });
});
