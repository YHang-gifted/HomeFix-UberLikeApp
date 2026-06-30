import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Payment } from '../../../shared/schemas';
import { PaymentsScreen } from './PaymentsScreen';

function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    requestId: '523e4567-e89b-12d3-a456-426614174000',
    customerId: '123e4567-e89b-12d3-a456-426614174000',
    workerId: '423e4567-e89b-12d3-a456-426614174000',
    amountCents: 150000,
    currency: 'TWD',
    status: 'paid',
    createdAt: '2026-06-22T00:00:00.000Z',
    paidAt: '2026-06-22T01:00:00.000Z',
    ...overrides,
  };
}

describe('PaymentsScreen', () => {
  it('renders the customer payments with a formatted amount and status', async () => {
    const listMyPayments = jest.fn().mockResolvedValue([makePayment()]);
    const client = { listMyPayments } as unknown as ApiClient;

    const { findByText } = await render(<PaymentsScreen client={client} />);

    await findByText('NT$1,500.00');
    await findByText('paid');
  });

  it('shows the marketplace split when a payment carries a platform fee', async () => {
    const listMyPayments = jest
      .fn()
      .mockResolvedValue([
        makePayment({ amountCents: 150000, platformFeeCents: 22500, workerNetCents: 127500 }),
      ]);
    const client = { listMyPayments } as unknown as ApiClient;

    const { findByText } = await render(<PaymentsScreen client={client} />);

    await findByText(/Worker net NT\$1,275\.00 · Platform fee NT\$225\.00/);
  });

  it('omits the split line for a payment without a platform fee', async () => {
    const listMyPayments = jest.fn().mockResolvedValue([makePayment()]);
    const client = { listMyPayments } as unknown as ApiClient;

    const { findByText, queryByText } = await render(<PaymentsScreen client={client} />);

    await findByText('NT$1,500.00');
    expect(queryByText(/Platform fee/)).toBeNull();
  });

  it('shows an empty state when there are no payments', async () => {
    const listMyPayments = jest.fn().mockResolvedValue([]);
    const client = { listMyPayments } as unknown as ApiClient;

    const { findByText } = await render(<PaymentsScreen client={client} />);

    await findByText('You have no payments yet.');
  });

  it('opens the request when a receipt is tapped', async () => {
    const payment = makePayment();
    const listMyPayments = jest.fn().mockResolvedValue([payment]);
    const client = { listMyPayments } as unknown as ApiClient;
    const onSelectRequest = jest.fn();

    const { findByText, getByLabelText } = await render(
      <PaymentsScreen client={client} onSelectRequest={onSelectRequest} />,
    );
    await findByText('NT$1,500.00');
    await fireEvent.press(getByLabelText('Payment NT$1,500.00, paid'));

    await waitFor(() => {
      expect(onSelectRequest).toHaveBeenCalledWith(payment.requestId);
    });
  });

  it('shows an error message when loading fails', async () => {
    const listMyPayments = jest.fn().mockRejectedValue(new Error('network'));
    const client = { listMyPayments } as unknown as ApiClient;

    const { findByText } = await render(<PaymentsScreen client={client} />);

    await findByText('Could not load your payments.');
  });
});
