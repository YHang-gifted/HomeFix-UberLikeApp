import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { SavedCard } from '../../../shared/schemas';
import { PaymentMethodsScreen } from './PaymentMethodsScreen';

function makeCard(overrides: Partial<SavedCard> = {}): SavedCard {
  return {
    id: 'pm_123',
    brand: 'visa',
    last4: '4242',
    expMonth: 9,
    expYear: 2030,
    ...overrides,
  };
}

describe('PaymentMethodsScreen', () => {
  it('renders a saved card with brand, last4 and a padded expiry', async () => {
    const listPaymentMethods = jest.fn().mockResolvedValue([makeCard()]);
    const client = { listPaymentMethods } as unknown as ApiClient;

    const { findByText } = await render(<PaymentMethodsScreen client={client} />);

    await findByText('Visa');
    await findByText('•••• 4242 · Exp 09/2030');
  });

  it('shows an empty state when there are no cards', async () => {
    const listPaymentMethods = jest.fn().mockResolvedValue([]);
    const client = { listPaymentMethods } as unknown as ApiClient;

    const { findByText } = await render(<PaymentMethodsScreen client={client} />);

    await findByText('No saved cards yet.');
  });

  it('adds a card: opens the hosted setup URL', async () => {
    const listPaymentMethods = jest.fn().mockResolvedValue([]);
    const startCardSetup = jest
      .fn()
      .mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/setup/x' });
    const openCheckout = jest.fn().mockResolvedValue(undefined);
    const client = { listPaymentMethods, startCardSetup } as unknown as ApiClient;

    const { findByLabelText } = await render(
      <PaymentMethodsScreen client={client} openCheckout={openCheckout} savedCardsEnabled />,
    );

    await fireEvent.press(await findByLabelText('Add a card'));
    await waitFor(() => {
      expect(startCardSetup).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(openCheckout).toHaveBeenCalledWith('https://checkout.stripe.com/setup/x');
    });
  });

  it('hides the add-card button when saved cards are not enabled', async () => {
    const listPaymentMethods = jest.fn().mockResolvedValue([]);
    const client = { listPaymentMethods } as unknown as ApiClient;

    const { findByText, queryByLabelText } = await render(
      <PaymentMethodsScreen client={client} savedCardsEnabled={false} />,
    );

    await findByText('No saved cards yet.');
    expect(queryByLabelText('Add a card')).toBeNull();
  });

  it('surfaces a load error rather than a blank list', async () => {
    const listPaymentMethods = jest.fn().mockRejectedValue(new Error('offline'));
    const client = { listPaymentMethods } as unknown as ApiClient;

    const { findByText } = await render(<PaymentMethodsScreen client={client} />);

    await findByText('Could not load your saved cards.');
  });
});
