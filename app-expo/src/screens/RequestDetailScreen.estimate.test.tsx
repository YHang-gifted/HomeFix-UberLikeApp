import { render } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// AI estimate, UI (slice 3): a non-binding rough range shown on a quote-track job to set the
// customer's expectation before workers quote. It disappears once a quote is accepted (the agreed
// price is the source of truth) and never shows on a fixed-price job (the server 404s the estimate).

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const OWNER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: REQUEST_ID,
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'The kitchen sink is blocked',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
    ...overrides,
  };
}

function acceptedQuote() {
  return {
    id: '623e4567-e89b-12d3-a456-426614174888',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 15000,
    currency: 'USD',
    status: 'accepted',
    createdAt: '2026-06-22T00:00:00.000Z',
  };
}

function clientWith(extra: Record<string, unknown>) {
  return {
    getPrincipal: jest.fn().mockReturnValue(OWNER),
    getServiceRequest: jest.fn().mockResolvedValue(makeRequest()),
    getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
    getQuote: jest.fn().mockRejectedValue(new ApiError(404, 'no quote')),
    getEstimate: jest.fn().mockResolvedValue({ lowCents: 8000, highCents: 30000 }),
    ...extra,
  } as unknown as ApiClient;
}

describe('RequestDetailScreen — rough estimate', () => {
  it('shows the non-binding range on a quote-track request with no accepted quote', async () => {
    const { findByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={clientWith({})} />,
    );

    await findByText('Rough estimate');
    await findByText('$80.00 – $300.00');
  });

  it('hides the estimate once a quote is accepted (the agreed price wins)', async () => {
    // An accepted quote implies an assigned worker; the quote box renders only when workerId is set.
    const client = clientWith({
      getServiceRequest: jest
        .fn()
        .mockResolvedValue(makeRequest({ status: 'accepted', workerId: WORKER_ID })),
      getQuote: jest.fn().mockResolvedValue(acceptedQuote()),
    });

    const { findByText, queryByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await findByText('Quote'); // the quote box has rendered
    expect(queryByText('Rough estimate')).toBeNull();
  });

  it('shows nothing when there is no estimate (fixed-price job → 404)', async () => {
    const client = clientWith({
      getEstimate: jest.fn().mockRejectedValue(new ApiError(404, 'fixed price')),
    });

    const { findByText, queryByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    // Wait for the screen to settle on a stable element, then assert the estimate is absent.
    await findByText('The kitchen sink is blocked');
    expect(queryByText('Rough estimate')).toBeNull();
  });
});
