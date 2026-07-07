import { Linking } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import type { Principal, ServiceRequest } from '../../../shared/schemas';
import { RequestDetailScreen } from './RequestDetailScreen';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const ADMIN_ID = '323e4567-e89b-12d3-a456-426614174000';
const OWNER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Leaking kitchen sink',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function clientWith(extra: Record<string, unknown>, principal: Principal = OWNER) {
  return { getPrincipal: jest.fn().mockReturnValue(principal), ...extra } as unknown as ApiClient;
}

function makePayment(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174777',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 150000,
    currency: 'TWD',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function makeQuote(overrides = {}) {
  return {
    id: '623e4567-e89b-12d3-a456-426614174888',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    amountCents: 250000,
    currency: 'TWD',
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('RequestDetailScreen payments', () => {
  it('lets the owning customer set up then pay a payment', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const createPayment = jest.fn().mockResolvedValue(makePayment());
    const payPayment = jest
      .fn()
      .mockResolvedValue(makePayment({ status: 'paid', paidAt: '2026-06-22T01:00:00.000Z' }));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
      createPayment,
      payPayment,
    });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Payment amount'), '1500');
    await fireEvent.press(await findByLabelText('Set up payment'));

    await waitFor(() => {
      expect(createPayment).toHaveBeenCalledWith(request.id, 150000);
    });
    await findByText('NT$1,500.00');

    await fireEvent.press(await findByLabelText('Pay now'));
    await waitFor(() => {
      expect(payPayment).toHaveBeenCalledWith(request.id);
    });
    await findByText('Paid');
  });

  it('redirects to the hosted checkout page when the payment carries a checkout URL', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const createPayment = jest
      .fn()
      .mockResolvedValue(makePayment({ checkoutUrl: 'https://checkout.stripe.com/pay/cs_1' }));
    const payPayment = jest.fn();
    const openCheckout = jest.fn().mockResolvedValue(undefined);
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
      createPayment,
      payPayment,
    });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} openCheckout={openCheckout} />,
    );

    await fireEvent.changeText(await findByLabelText('Payment amount'), '1500');
    await fireEvent.press(await findByLabelText('Set up payment'));
    await findByText('NT$1,500.00');

    await fireEvent.press(await findByLabelText('Pay now'));
    await waitFor(() => {
      expect(openCheckout).toHaveBeenCalledWith('https://checkout.stripe.com/pay/cs_1');
    });
    // The mock /pay is never used in real-provider mode; settlement is via webhook.
    expect(payPayment).not.toHaveBeenCalled();
    await findByText(/Complete the payment in the page that opened/);
  });

  it('shows an error when the hosted checkout page cannot be opened', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const createPayment = jest
      .fn()
      .mockResolvedValue(makePayment({ checkoutUrl: 'https://checkout.stripe.com/pay/cs_2' }));
    const openCheckout = jest.fn().mockRejectedValue(new Error('no browser'));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
      createPayment,
      payPayment: jest.fn(),
    });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} openCheckout={openCheckout} />,
    );

    await fireEvent.changeText(await findByLabelText('Payment amount'), '1500');
    await fireEvent.press(await findByLabelText('Set up payment'));
    await findByText('NT$1,500.00');

    await fireEvent.press(await findByLabelText('Pay now'));
    await findByText('Could not open the payment page.');
  });

  it('shows the receipt when a party views it for a paid payment', async () => {
    const request = makeRequest({ status: 'completed', workerId: WORKER_ID });
    const paidPayment = makePayment({ status: 'paid', paidAt: '2026-06-22T01:00:00.000Z' });
    const getPaymentReceipt = jest.fn().mockResolvedValue({
      receiptNumber: 'HF-20260622-1A2B3C4D',
      paymentId: paidPayment.id,
      requestId: request.id,
      issuedAt: '2026-06-22T01:00:00.000Z',
      currency: 'TWD',
      amountCents: 150000,
      platformFeeCents: 22500,
      workerNetCents: 127500,
      customerName: 'Casey Customer',
      workerName: 'Wendy Worker',
      category: 'plumbing',
      description: 'Leaking kitchen sink',
    });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getPayment: jest.fn().mockResolvedValue(paidPayment),
      getPaymentReceipt,
    });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Paid');
    await fireEvent.press(await findByLabelText('View receipt'));
    await waitFor(() => {
      expect(getPaymentReceipt).toHaveBeenCalledWith(request.id);
    });
    await findByText('HF-20260622-1A2B3C4D');
    await findByText('Receipt');
  });

  it('shows the human address and opens the coordinates in Maps', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const request = makeRequest({
      address: 'No. 7, Sec. 5, Xinyi Rd, Taipei',
      location: { latitude: 25.033, longitude: 121.5654 },
    });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(request) });

    const { findByText, findByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    // The address is shown instead of raw coordinates.
    await findByText('No. 7, Sec. 5, Xinyi Rd, Taipei');

    await fireEvent.press(await findByLabelText('Open in Maps'));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/search/?api=1&query=25.033%2C121.5654',
      );
    });
    openSpy.mockRestore();
  });

  it('prefills the payment amount from an accepted quote', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const createPayment = jest.fn().mockResolvedValue(makePayment({ amountCents: 250000 }));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getPayment: jest.fn().mockRejectedValue(new ApiError(404, 'no payment')),
      getQuote: jest.fn().mockResolvedValue(makeQuote({ status: 'accepted' })),
      createPayment,
    });

    const { findByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    const input = await findByLabelText('Payment amount');
    expect(input.props.value).toBe('2500');
    await fireEvent.press(await findByLabelText('Set up payment'));
    await waitFor(() => {
      expect(createPayment).toHaveBeenCalledWith(request.id, 250000);
    });
  });

  it('shows the payment status to the assigned worker without a pay action', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getPayment: jest.fn().mockResolvedValue(makePayment({ status: 'paid' })),
      },
      { id: WORKER_ID, role: 'worker' },
    );

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('NT$1,500.00');
    await findByText('Paid');
    expect(queryByLabelText('Pay now')).toBeNull();
    expect(queryByLabelText('Set up payment')).toBeNull();
    // Refunds are admin-only.
    expect(queryByLabelText('Refund payment')).toBeNull();
  });

  it('lets an admin refund a paid payment and shows it as refunded', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const refundPayment = jest
      .fn()
      .mockResolvedValue(makePayment({ status: 'refunded', paidAt: '2026-06-22T01:00:00.000Z' }));
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getPayment: jest
          .fn()
          .mockResolvedValue(makePayment({ status: 'paid', paidAt: '2026-06-22T01:00:00.000Z' })),
        refundPayment,
      },
      { id: ADMIN_ID, role: 'admin' },
    );

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Paid');
    await fireEvent.press(await findByLabelText('Refund payment'));

    await waitFor(() => {
      expect(refundPayment).toHaveBeenCalledWith(request.id);
    });
    await findByText('Refunded');
  });
});

describe('RequestDetailScreen', () => {
  it('renders the request and offers cancel for the owner on a non-terminal request', async () => {
    const request = makeRequest({ status: 'pending' });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      updateServiceRequestStatus: jest.fn(),
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Leaking kitchen sink');
    getByLabelText('Cancel request');
  });

  it('shows the preferred time when the request has one', async () => {
    const request = makeRequest({ scheduledAt: '2026-07-01T09:00:00.000Z' });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(request) });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Preferred time');
  });

  it('shows photos when the request has photo URLs', async () => {
    const request = makeRequest({ photoUrls: ['https://example.com/a.jpg'] });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(request) });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Photos');
    getByLabelText('Request photo');
  });

  it('shows the activity timeline from the request history', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const history = [
      {
        id: '623e4567-e89b-12d3-a456-426614174001',
        occurredAt: '2026-06-22T00:00:00.000Z',
        actorId: CUSTOMER_ID,
        actorRole: 'customer',
        action: 'service_request.created',
        resourceId: request.id,
      },
      {
        id: '623e4567-e89b-12d3-a456-426614174004',
        occurredAt: '2026-06-22T00:30:00.000Z',
        actorId: '323e4567-e89b-12d3-a456-426614174000',
        actorRole: 'admin',
        action: 'service_request.assigned',
        resourceId: request.id,
        details: { workerId: WORKER_ID, workerName: 'Demo Worker' },
      },
      {
        id: '623e4567-e89b-12d3-a456-426614174002',
        occurredAt: '2026-06-22T01:00:00.000Z',
        actorId: WORKER_ID,
        actorRole: 'worker',
        action: 'service_request.status_changed',
        resourceId: request.id,
        details: { from: 'matched', to: 'accepted' },
      },
    ];
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getRequestHistory: jest.fn().mockResolvedValue(history),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Activity');
    await findByText('Request created');
    await findByText('Worker assigned: Demo Worker');
    await findByText('Status changed to accepted');
  });

  it('cancels the request and calls onCancelled', async () => {
    const request = makeRequest({ status: 'pending' });
    const updateServiceRequestStatus = jest
      .fn()
      .mockResolvedValue({ ...request, status: 'cancelled' });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      updateServiceRequestStatus,
    });
    const onCancelled = jest.fn();

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} onCancelled={onCancelled} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.press(getByLabelText('Cancel request'));

    await waitFor(() => {
      expect(onCancelled).toHaveBeenCalledTimes(1);
    });
    expect(updateServiceRequestStatus).toHaveBeenCalledWith(request.id, 'cancelled', undefined);
  });

  it('passes a cancellation reason when one is entered', async () => {
    const request = makeRequest({ status: 'pending' });
    const updateServiceRequestStatus = jest
      .fn()
      .mockResolvedValue({ ...request, status: 'cancelled' });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      updateServiceRequestStatus,
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Leaking kitchen sink');
    await fireEvent.changeText(getByLabelText('Cancellation reason'), '  Booked someone else  ');
    await fireEvent.press(getByLabelText('Cancel request'));

    await waitFor(() => {
      expect(updateServiceRequestStatus).toHaveBeenCalledWith(
        request.id,
        'cancelled',
        'Booked someone else',
      );
    });
  });

  it('appends the cancellation reason to the timeline label', async () => {
    const request = makeRequest({ status: 'cancelled' });
    const history = [
      {
        id: '623e4567-e89b-12d3-a456-426614174003',
        occurredAt: '2026-06-22T02:00:00.000Z',
        actorId: CUSTOMER_ID,
        actorRole: 'customer',
        action: 'service_request.status_changed',
        resourceId: request.id,
        details: { from: 'pending', to: 'cancelled', reason: 'Booked someone else' },
      },
    ];
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getRequestHistory: jest.fn().mockResolvedValue(history),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText('Status changed to cancelled — Booked someone else');
  });

  it('hides cancel for a completed request', async () => {
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(makeRequest({ status: 'completed' })),
    });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId="523e4567-e89b-12d3-a456-426614174000" client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByLabelText('Cancel request')).toBeNull();
  });

  it('shows the requested timestamp label and the assigned worker name', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getWorker: jest.fn().mockResolvedValue({
        id: WORKER_ID,
        email: 'worker@homefix.test',
        displayName: 'Demo Worker',
      }),
      getRequestContacts: jest.fn().mockResolvedValue({ workerPhone: '+1 555 444 5555' }),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Requested');
    await findByText('Demo Worker');
    await findByText('+1 555 444 5555');
  });

  it('lets the assigned worker release an active job', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const releaseRequest = jest.fn().mockResolvedValue({ ...request, status: 'pending' });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request), releaseRequest },
      { id: WORKER_ID, role: 'worker' },
    );
    const onReleased = jest.fn();

    const { findByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} onReleased={onReleased} />,
    );
    await fireEvent.press(await findByLabelText('Release job'));

    await waitFor(() => {
      expect(releaseRequest).toHaveBeenCalledWith(request.id);
    });
    await waitFor(() => {
      expect(onReleased).toHaveBeenCalledTimes(1);
    });
  });

  it('lets an admin reset an assigned job', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const resetRequest = jest.fn().mockResolvedValue({ ...request, status: 'pending' });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request), resetRequest },
      { id: ADMIN_ID, role: 'admin' },
    );
    const onReset = jest.fn();

    const { findByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} onReset={onReset} />,
    );
    await fireEvent.press(await findByLabelText('Reset assignment'));

    await waitFor(() => {
      expect(resetRequest).toHaveBeenCalledWith(request.id);
    });
    await waitFor(() => {
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  it('does not show release to the owning customer', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const client = clientWith({ getServiceRequest: jest.fn().mockResolvedValue(request) });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByLabelText('Release job')).toBeNull();
  });

  it('shows the assigned worker bio and specialties', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getWorker: jest.fn().mockResolvedValue({
        id: WORKER_ID,
        email: 'worker@homefix.test',
        displayName: 'Demo Worker',
        bio: 'Master electrician.',
        skills: ['electrical'],
      }),
    });

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Master electrician.');
    await findByText('Specialties: electrical');
  });

  it('lets the customer favorite the assigned worker', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const addFavorite = jest
      .fn()
      .mockResolvedValue([{ id: WORKER_ID, displayName: 'Demo Worker', role: 'worker' }]);
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getWorker: jest.fn().mockResolvedValue({
        id: WORKER_ID,
        email: 'worker@homefix.test',
        displayName: 'Demo Worker',
      }),
      listFavorites: jest.fn().mockResolvedValue([]),
      addFavorite,
    });

    const { findByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await fireEvent.press(await findByLabelText('Add to favorites'));

    await waitFor(() => {
      expect(addFavorite).toHaveBeenCalledWith(WORKER_ID);
    });
    await findByLabelText('Remove from favorites');
  });

  it('shows the ordering customer name to a non-owner (worker/admin)', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const worker: Principal = { id: WORKER_ID, role: 'worker' };
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getUser: jest.fn().mockResolvedValue({
          id: CUSTOMER_ID,
          displayName: 'Demo Customer',
          role: 'customer',
        }),
        getRequestContacts: jest.fn().mockResolvedValue({ customerPhone: '+1 555 222 3333' }),
      },
      worker,
    );

    const { findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Customer');
    await findByText('Demo Customer');
    await findByText('+1 555 222 3333');
  });

  it('submits a review for a completed request', async () => {
    const request = makeRequest({ status: 'completed' });
    const createReview = jest
      .fn()
      .mockResolvedValue({ id: 'r1', requestId: request.id, rating: 5 });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      createReview,
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Rate the worker');
    await fireEvent.press(getByLabelText('Rate 5'));
    await fireEvent.press(getByLabelText('Submit review'));

    await findByText('Thanks for your review!');
    expect(createReview).toHaveBeenCalledWith(request.id, { rating: 5 });
  });

  it('shows an already-reviewed message on a 409', async () => {
    const request = makeRequest({ status: 'completed' });
    const createReview = jest.fn().mockRejectedValue(new ApiError(409, 'already reviewed'));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      createReview,
    });

    const { findByText, getByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Rate the worker');
    await fireEvent.press(getByLabelText('Rate 4'));
    await fireEvent.press(getByLabelText('Submit review'));

    await findByText('You have already reviewed this request.');
  });

  it('hides owner actions from a non-owner (worker) viewer', async () => {
    const request = makeRequest({ status: 'completed', workerId: WORKER_ID });
    const client = clientWith(
      { getServiceRequest: jest.fn().mockResolvedValue(request) },
      { id: WORKER_ID, role: 'worker' },
    );

    const { findByText, queryByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByText('Rate the worker')).toBeNull();
    expect(queryByLabelText('Cancel request')).toBeNull();
  });
});

describe('RequestDetailScreen review replies', () => {
  const baseReview = {
    id: '623e4567-e89b-12d3-a456-426614174999',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    workerId: WORKER_ID,
    rating: 5,
    comment: 'Great work',
    createdAt: '2026-06-22T00:00:00.000Z',
  };

  it('lets the assigned worker reply to the review', async () => {
    const request = makeRequest({ status: 'completed', workerId: WORKER_ID });
    const replyToReview = jest.fn().mockResolvedValue({
      ...baseReview,
      reply: 'Thank you!',
      repliedAt: '2026-06-23T00:00:00.000Z',
    });
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getReview: jest.fn().mockResolvedValue(baseReview),
        replyToReview,
      },
      { id: WORKER_ID, role: 'worker' },
    );

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Reply to review'), '  Thank you!  ');
    await fireEvent.press(await findByLabelText('Send reply'));

    await waitFor(() => {
      expect(replyToReview).toHaveBeenCalledWith(request.id, 'Thank you!');
    });
    await findByText('Reply posted.');
  });

  it('shows the worker reply to the owning customer without a reply box', async () => {
    const request = makeRequest({ status: 'completed', workerId: WORKER_ID });
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getReview: jest.fn().mockResolvedValue({
        ...baseReview,
        reply: 'Thanks for the feedback',
        repliedAt: '2026-06-23T00:00:00.000Z',
      }),
    });

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await findByText("Worker's reply");
    await findByText('Thanks for the feedback');
    expect(queryByLabelText('Reply to review')).toBeNull();
  });
});

describe('RequestDetailScreen quotes', () => {
  it('lets the assigned worker propose a quote', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const createQuote = jest.fn().mockResolvedValue(makeQuote());
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getQuote: jest.fn().mockRejectedValue(new ApiError(404, 'no quote')),
        createQuote,
      },
      { id: WORKER_ID, role: 'worker' },
    );

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Quote amount'), '2500');
    await fireEvent.changeText(await findByLabelText('Quote note'), '  Parts and labor  ');
    await fireEvent.press(await findByLabelText('Send quote'));

    await waitFor(() => {
      expect(createQuote).toHaveBeenCalledWith(request.id, {
        amountCents: 250000,
        note: 'Parts and labor',
      });
    });
    await findByText('NT$2,500.00');
    await findByText('Pending');
  });

  it('lets the owning customer accept a pending quote', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const acceptQuote = jest.fn().mockResolvedValue(makeQuote({ status: 'accepted' }));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getQuote: jest.fn().mockResolvedValue(makeQuote()),
      acceptQuote,
    });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await fireEvent.press(await findByLabelText('Accept quote'));
    await waitFor(() => {
      expect(acceptQuote).toHaveBeenCalledWith(request.id);
    });
    await findByText('Accepted');
  });

  it('lets the owning customer decline a pending quote', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const declineQuote = jest.fn().mockResolvedValue(makeQuote({ status: 'declined' }));
    const client = clientWith({
      getServiceRequest: jest.fn().mockResolvedValue(request),
      getQuote: jest.fn().mockResolvedValue(makeQuote()),
      declineQuote,
    });

    const { findByLabelText, findByText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );

    await fireEvent.press(await findByLabelText('Decline quote'));
    await waitFor(() => {
      expect(declineQuote).toHaveBeenCalledWith(request.id);
    });
    await findByText('Declined');
  });

  it('does not offer quote actions to a non-assigned worker', async () => {
    const request = makeRequest({ status: 'matched', workerId: WORKER_ID });
    const client = clientWith(
      {
        getServiceRequest: jest.fn().mockResolvedValue(request),
        getQuote: jest.fn().mockRejectedValue(new ApiError(404, 'no quote')),
      },
      { id: '999e4567-e89b-12d3-a456-426614174000', role: 'worker' },
    );

    const { findByText, queryByLabelText } = await render(
      <RequestDetailScreen requestId={request.id} client={client} />,
    );
    await findByText('Leaking kitchen sink');
    expect(queryByLabelText('Send quote')).toBeNull();
  });
});
