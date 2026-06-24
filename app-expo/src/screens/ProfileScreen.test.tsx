import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { UserProfile } from '../../../shared/schemas';
import { ProfileScreen } from './ProfileScreen';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: CUSTOMER_ID,
    email: 'customer@homefix.test',
    role: 'customer',
    displayName: 'Demo Customer',
    ...overrides,
  };
}

describe('ProfileScreen', () => {
  it('shows the profile and saves a new display name', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const updateProfile = jest.fn().mockResolvedValue(makeProfile({ displayName: 'New Name' }));
    const client = { getMe, updateProfile } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ProfileScreen client={client} />);

    await findByText('customer@homefix.test');
    await fireEvent.changeText(getByLabelText('Display name'), 'New Name');
    await fireEvent.press(getByLabelText('Save profile'));

    await findByText('Saved');
    expect(updateProfile).toHaveBeenCalledWith({ displayName: 'New Name' });
  });

  it('rejects an empty display name without calling the API', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const updateProfile = jest.fn();
    const client = { getMe, updateProfile } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ProfileScreen client={client} />);
    await findByText('customer@homefix.test');
    await fireEvent.changeText(getByLabelText('Display name'), '   ');
    await fireEvent.press(getByLabelText('Save profile'));

    await findByText('Display name cannot be empty.');
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
