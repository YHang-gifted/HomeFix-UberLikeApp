import { render } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// Assessment visit, UI half: while the price is provisional the customer must not be offered the
// payment form — paying the visit fee would lock the price and block the worker's on-site revision
// (the server 409s). They see what happens next instead.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OWNER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    category: 'general',
    description: 'Something is wrong behind the wall',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'accepted',
    workerId: WORKER_ID,
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
    pricingMode: 'fixed',
    fixedPriceCents: 4900,
    ...overrides,
  };
}

function clientWith(request: ServiceRequest) {
  return {
    getPrincipal: jest.fn().mockReturnValue(OWNER),
    getServiceRequest: jest.fn().mockResolvedValue(request),
    getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
  } as unknown as ApiClient;
}

describe('RequestDetailScreen — provisional price (assessment visit)', () => {
  it('explains the visit fee instead of offering the payment form', async () => {
    const client = clientWith(makeRequest({ priceProvisional: true }));

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText(/final price on site/i);
    expect(queryByLabelText('Set up payment')).toBeNull();
    expect(queryByLabelText('Payment amount')).toBeNull();
  });

  it('offers the payment form once the price is final', async () => {
    // After the worker's on-site revision the server clears the flag.
    const client = clientWith(makeRequest({ priceProvisional: false }));

    const { findByLabelText, queryByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByLabelText('Set up payment');
    expect(queryByText(/final price on site/i)).toBeNull();
  });

  it('is unaffected on an ordinary job (no flag at all)', async () => {
    const client = clientWith(makeRequest());

    const { findByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByLabelText('Set up payment');
  });
});
