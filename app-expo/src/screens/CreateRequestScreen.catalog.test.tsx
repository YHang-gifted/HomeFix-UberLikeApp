import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { CatalogItem, ServiceRequest } from '../../../shared/schemas';
import { CreateRequestScreen } from './CreateRequestScreen';

// Fixed-price catalog, slice 4 (customer UI): picking a standard job books it at the platform price
// — the screen sends `catalogItemId` and the server prices it. "Something else" keeps the existing
// quote-track flow. The customer never chooses a "pricing mode"; the catalog choice decides it.

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

const DRAIN: CatalogItem = {
  id: 'drain-unclog',
  category: 'plumbing',
  title: 'Unclog a drain',
  priceCents: 12000,
};

function makeRequest(): ServiceRequest {
  return {
    id: '223e4567-e89b-12d3-a456-426614174000',
    customerId: CUSTOMER_ID,
    category: 'plumbing',
    description: 'Unclog a drain',
    location: { latitude: 25.03, longitude: 121.56 },
    status: 'pending',
    createdAt: '2026-06-22T00:00:00.000Z',
    scheduleStatus: 'unset',
  };
}

function clientWith(extra: Record<string, unknown> = {}) {
  return {
    getPrincipal: jest.fn().mockReturnValue({ id: CUSTOMER_ID, role: 'customer' }),
    listCatalog: jest.fn().mockResolvedValue([DRAIN]),
    ...extra,
  } as unknown as ApiClient;
}

describe('CreateRequestScreen — fixed-price catalog', () => {
  it('books a standard job: sends catalogItemId and the catalog category', async () => {
    const createServiceRequest = jest.fn().mockResolvedValue(makeRequest());
    const client = clientWith({ createServiceRequest });

    const { findByLabelText, getByLabelText } = await render(
      <CreateRequestScreen client={client} />,
    );

    // Picking the standard job fills in its category and a starting description.
    await fireEvent.press(await findByLabelText(`Standard job ${DRAIN.title}`));
    await fireEvent.changeText(getByLabelText('Latitude'), '25.03');
    await fireEvent.changeText(getByLabelText('Longitude'), '121.56');
    await fireEvent.press(getByLabelText('Create request'));

    await waitFor(() => {
      expect(createServiceRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogItemId: DRAIN.id,
          category: DRAIN.category,
          description: DRAIN.title,
        }),
      );
    });
  });

  it('shows the fixed price for the catalog task', async () => {
    const { findByText } = await render(<CreateRequestScreen client={clientWith()} />);
    await findByText('$120.00');
  });

  it('"Something else" returns to the quote track (no catalogItemId)', async () => {
    const createServiceRequest = jest.fn().mockResolvedValue(makeRequest());
    const client = clientWith({ createServiceRequest });

    const { findByLabelText, getByLabelText } = await render(
      <CreateRequestScreen client={client} />,
    );

    await fireEvent.press(await findByLabelText(`Standard job ${DRAIN.title}`));
    await fireEvent.press(getByLabelText('Something else'));

    // The category chips are back, so the customer picks their own category again.
    await fireEvent.press(getByLabelText('Category plumbing'));
    await fireEvent.changeText(getByLabelText('Description'), 'Something unusual');
    await fireEvent.changeText(getByLabelText('Latitude'), '25.03');
    await fireEvent.changeText(getByLabelText('Longitude'), '121.56');
    await fireEvent.press(getByLabelText('Create request'));

    await waitFor(() => {
      expect(createServiceRequest).toHaveBeenCalled();
    });
    const [input] = createServiceRequest.mock.calls[0];
    expect(input.catalogItemId).toBeUndefined();
  });

  it('marks an assessment visit as a visit fee, not the job price', async () => {
    const visit: CatalogItem = {
      id: 'assessment-visit',
      category: 'general',
      title: 'On-site assessment visit',
      priceCents: 4900,
      assessment: true,
    };
    const client = clientWith({ listCatalog: jest.fn().mockResolvedValue([visit]) });

    const { findByText } = await render(<CreateRequestScreen client={client} />);

    await findByText(/final price is agreed on site/i);
  });

  it('degrades to the normal form when the catalog cannot be loaded', async () => {
    const client = clientWith({ listCatalog: jest.fn().mockRejectedValue(new Error('offline')) });

    const { findByLabelText, queryByLabelText } = await render(
      <CreateRequestScreen client={client} />,
    );

    // The category picker is present (the pre-catalog behaviour) and no standard jobs are offered.
    await findByLabelText('Category plumbing');
    expect(queryByLabelText(`Standard job ${DRAIN.title}`)).toBeNull();
  });
});
