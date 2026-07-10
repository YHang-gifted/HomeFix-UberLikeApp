import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Payout } from '../../../shared/schemas';
import { PayoutsScreen } from './PayoutsScreen';

function makePayout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: '723e4567-e89b-12d3-a456-426614174000',
    paymentId: '623e4567-e89b-12d3-a456-426614174000',
    workerId: '423e4567-e89b-12d3-a456-426614174000',
    amountCents: 127500,
    currency: 'TWD',
    status: 'paid',
    createdAt: '2026-06-22T00:00:00.000Z',
    paidAt: '2026-06-22T02:00:00.000Z',
    ...overrides,
  };
}

describe('PayoutsScreen', () => {
  it('renders a settled payout with its net amount', async () => {
    const listMyPayouts = jest.fn().mockResolvedValue([makePayout()]);
    const client = { listMyPayouts } as unknown as ApiClient;

    const { findByText } = await render(<PayoutsScreen client={client} />);

    await findByText('NT$1,275.00');
    await findByText('Paid out');
  });

  it('shows a pending payout', async () => {
    const listMyPayouts = jest
      .fn()
      .mockResolvedValue([makePayout({ status: 'pending', paidAt: undefined })]);
    const client = { listMyPayouts } as unknown as ApiClient;

    const { findByText } = await render(<PayoutsScreen client={client} />);

    await findByText('Pending');
  });

  it('shows an empty state when there are no payouts', async () => {
    const listMyPayouts = jest.fn().mockResolvedValue([]);
    const client = { listMyPayouts } as unknown as ApiClient;

    const { findByText } = await render(<PayoutsScreen client={client} />);

    await findByText('You have no payouts yet.');
  });

  it('shows an earnings summary card from the totals', async () => {
    const listMyPayouts = jest.fn().mockResolvedValue([makePayout()]);
    const getMyEarnings = jest.fn().mockResolvedValue({
      paidCount: 2,
      paidAmountCents: 500000,
      pendingCount: 3,
      pendingAmountCents: 200000,
    });
    const client = { listMyPayouts, getMyEarnings } as unknown as ApiClient;

    const { findByText } = await render(<PayoutsScreen client={client} />);

    await findByText('NT$5,000.00');
    await findByText('2 payout(s)');
    await findByText('NT$2,000.00');
    await findByText('3 scheduled');
  });

  it('starts payout onboarding and redirects to the hosted URL', async () => {
    const listMyPayouts = jest.fn().mockResolvedValue([]);
    const startConnectOnboarding = jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/onboard/x' });
    const openCheckout = jest.fn().mockResolvedValue(undefined);
    const client = { listMyPayouts, startConnectOnboarding } as unknown as ApiClient;

    const { findByLabelText } = await render(
      <PayoutsScreen client={client} openCheckout={openCheckout} payoutsEnabled />,
    );

    await fireEvent.press(await findByLabelText('Set up payouts'));
    await waitFor(() => {
      expect(startConnectOnboarding).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(openCheckout).toHaveBeenCalledWith('https://connect.stripe.com/onboard/x');
    });
  });

  it('hides the setup button when payouts are not enabled', async () => {
    const listMyPayouts = jest.fn().mockResolvedValue([]);
    const client = { listMyPayouts } as unknown as ApiClient;

    const { findByText, queryByLabelText } = await render(<PayoutsScreen client={client} />);

    await findByText('You have no payouts yet.');
    expect(queryByLabelText('Set up payouts')).toBeNull();
  });
});
