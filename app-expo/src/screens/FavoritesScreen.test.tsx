import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { PublicUser } from '../../../shared/schemas';
import { FavoritesScreen } from './FavoritesScreen';

const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

function makeWorker(overrides: Partial<PublicUser> = {}): PublicUser {
  return { id: WORKER_ID, displayName: 'Demo Worker', role: 'worker', ...overrides };
}

function clientWith(extra: Record<string, unknown>) {
  return extra as unknown as ApiClient;
}

describe('FavoritesScreen', () => {
  it('lists the customer’s favorite workers', async () => {
    const client = clientWith({
      listFavorites: jest.fn().mockResolvedValue([makeWorker()]),
    });

    const { findByText } = await render(<FavoritesScreen client={client} />);

    await findByText('Demo Worker');
  });

  it('shows an empty state when there are no favorites', async () => {
    const client = clientWith({ listFavorites: jest.fn().mockResolvedValue([]) });

    const { findByText } = await render(<FavoritesScreen client={client} />);

    await findByText('You have not favorited any workers yet.');
  });

  it('removes a favorite and reloads', async () => {
    const listFavorites = jest.fn().mockResolvedValueOnce([makeWorker()]).mockResolvedValueOnce([]);
    const removeFavorite = jest.fn().mockResolvedValue([]);
    const client = clientWith({ listFavorites, removeFavorite });

    const { findByLabelText, findByText } = await render(<FavoritesScreen client={client} />);

    await fireEvent.press(await findByLabelText('Remove Demo Worker from favorites'));

    await waitFor(() => {
      expect(removeFavorite).toHaveBeenCalledWith(WORKER_ID);
    });
    await findByText('You have not favorited any workers yet.');
  });
});
