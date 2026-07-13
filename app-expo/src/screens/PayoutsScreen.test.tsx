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
    currency: 'USD',
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

    await findByText('$1,275.00');
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

    await findByText('$5,000.00');
    await findByText('2 payout(s)');
    await findByText('$2,000.00');
    await findByText('3 scheduled');
  });

  it('starts payout onboarding and redirects to the hosted URL', async () => {
    const listMyPayouts = jest.fn().mockResolvedValue([]);
    const startConnectOnboarding = jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/onboard/x' });
    const openCheckout = jest.fn().mockResolvedValue(undefined);
    const client = {
      listMyPayouts,
      startConnectOnboarding,
      getMe: jest.fn().mockResolvedValue({ payoutAccountStatus: 'none' }),
    } as unknown as ApiClient;

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

  // slice 184: the screen used to key off nothing but the build-time feature flag, so it kept
  // offering "Set up payouts" to a worker who had already finished — and said nothing at all
  // to one stuck mid-verification while their payouts silently piled up as Pending.
  describe('payout account status', () => {
    function clientWith(payoutAccountStatus: string | undefined) {
      return {
        listMyPayouts: jest.fn().mockResolvedValue([]),
        startConnectOnboarding: jest.fn(),
        getMe: jest.fn().mockResolvedValue({ payoutAccountStatus }),
      } as unknown as ApiClient;
    }

    it('does not invite an onboarded worker to set up payouts again', async () => {
      const { findByText, queryByLabelText } = await render(
        <PayoutsScreen client={clientWith('enabled')} payoutsEnabled />,
      );

      await findByText('Payouts are active');
      expect(queryByLabelText('Set up payouts')).toBeNull();
      // Bank details do change — reachable, just not as a call to action.
      expect(queryByLabelText('Update payout details')).not.toBeNull();
    });

    it('explains the half-finished state instead of leaving the money unexplained', async () => {
      const { findByText, findByLabelText, queryByLabelText } = await render(
        <PayoutsScreen client={clientWith('pending')} payoutsEnabled />,
      );

      await findByText('Payout setup is not finished');
      await findByText(/still verifying/i);
      await findByLabelText('Finish payout setup');
      expect(queryByLabelText('Set up payouts')).toBeNull();
    });

    // `startConnectOnboarding` reuses the worker's existing connected account and just mints a
    // fresh hosted link, so all three states can share one endpoint.
    it('reuses the same endpoint to finish an incomplete setup', async () => {
      const startConnectOnboarding = jest
        .fn()
        .mockResolvedValue({ url: 'https://connect.stripe.com/onboard/again' });
      const openCheckout = jest.fn().mockResolvedValue(undefined);
      const client = {
        listMyPayouts: jest.fn().mockResolvedValue([]),
        startConnectOnboarding,
        getMe: jest.fn().mockResolvedValue({ payoutAccountStatus: 'pending' }),
      } as unknown as ApiClient;

      const { findByLabelText } = await render(
        <PayoutsScreen client={client} openCheckout={openCheckout} payoutsEnabled />,
      );

      await fireEvent.press(await findByLabelText('Finish payout setup'));
      await waitFor(() => {
        expect(openCheckout).toHaveBeenCalledWith('https://connect.stripe.com/onboard/again');
      });
    });

    it('hides the section when the status cannot be read, rather than guessing', async () => {
      const client = {
        listMyPayouts: jest.fn().mockResolvedValue([]),
        getMe: jest.fn().mockRejectedValue(new Error('offline')),
      } as unknown as ApiClient;

      const { findByText, queryByLabelText } = await render(
        <PayoutsScreen client={client} payoutsEnabled />,
      );

      await findByText('You have no payouts yet.');
      expect(queryByLabelText('Set up payouts')).toBeNull();
    });
  });
});
