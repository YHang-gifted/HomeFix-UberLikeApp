import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

// Phase 3b: the owning customer pays a pending card payment with a saved card, in-app. The screen
// lists saved cards, calls `paySavedCard`, and — when the card needs SCA — drives 3-D Secure via
// the injected `confirmCardAction`. Settlement itself is webhook-side, so the payment stays pending
// here; the screen just tells the customer to refresh.

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
    status: 'matched',
    workerId: WORKER_ID,
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
  };
}

function pendingCardPayment() {
  return {
    id: '623e4567-e89b-12d3-a456-426614174777',
    requestId: REQUEST_ID,
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 150000,
    currency: 'USD',
    status: 'pending',
    provider: 'stripe',
    createdAt: '2026-06-22T00:00:00.000Z',
  };
}

const VISA = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 9, expYear: 2030 };

function clientWith(extra: Record<string, unknown>) {
  return {
    getPrincipal: jest.fn().mockReturnValue(OWNER),
    getServiceRequest: jest.fn().mockResolvedValue(makeRequest()),
    getPayment: jest.fn().mockResolvedValue(pendingCardPayment()),
    listPaymentMethods: jest.fn().mockResolvedValue([VISA]),
    ...extra,
  } as unknown as ApiClient;
}

describe('RequestDetailScreen — pay with a saved card', () => {
  it('charges a saved card and tells the customer it will settle shortly', async () => {
    const paySavedCard = jest.fn().mockResolvedValue({ status: 'succeeded' });
    const client = clientWith({ paySavedCard });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await fireEvent.press(await findByLabelText('Pay with Visa ending 4242'));
    await waitFor(() => {
      expect(paySavedCard).toHaveBeenCalledWith(REQUEST_ID, 'pm_1');
    });
    await findByText(/show as paid once confirmed/i);
  });

  it('runs 3-D Secure via confirmCardAction when the card requires it', async () => {
    const paySavedCard = jest
      .fn()
      .mockResolvedValue({ status: 'requires_action', clientSecret: 'pi_x_secret' });
    const confirmCardAction = jest.fn().mockResolvedValue(undefined);
    const client = clientWith({ paySavedCard });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen
        requestId={REQUEST_ID}
        client={client}
        confirmCardAction={confirmCardAction}
      />,
    );

    await fireEvent.press(await findByLabelText('Pay with Visa ending 4242'));
    await waitFor(() => {
      expect(confirmCardAction).toHaveBeenCalledWith('pi_x_secret');
    });
    await findByText(/Card verified/i);
  });

  it('falls back to "pay another way" when SCA is needed but no handler is available', async () => {
    const paySavedCard = jest
      .fn()
      .mockResolvedValue({ status: 'requires_action', clientSecret: 'pi_x_secret' });
    // No confirmCardAction injected (e.g. web).
    const client = clientWith({ paySavedCard });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    await fireEvent.press(await findByLabelText('Pay with Visa ending 4242'));
    await findByText(/needs extra verification/i);
  });

  it('hides the saved-card option when the customer has none', async () => {
    const client = clientWith({ listPaymentMethods: jest.fn().mockResolvedValue([]) });

    const { findByLabelText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={REQUEST_ID} client={client} />,
    );

    // The hosted-checkout button is still there, labelled normally (no "pay another way").
    await findByLabelText('Pay now');
    expect(queryByLabelText('Pay with Visa ending 4242')).toBeNull();
  });
});
