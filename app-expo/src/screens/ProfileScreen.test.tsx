import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { UserProfile } from '../../../shared/schemas';
import { ProfileScreen } from './ProfileScreen';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';

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
    expect(updateProfile).toHaveBeenCalledWith({ displayName: 'New Name', phone: undefined });
  });

  it('shows the existing phone and saves an edited one', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile({ phone: '+1 555 000 1111' }));
    const updateProfile = jest.fn().mockResolvedValue(makeProfile({ phone: '+1 (555) 012-3456' }));
    const client = { getMe, updateProfile } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ProfileScreen client={client} />);
    await findByText('customer@homefix.test');
    expect(getByLabelText('Phone').props.value).toBe('+1 555 000 1111');

    await fireEvent.changeText(getByLabelText('Phone'), '+1 (555) 012-3456');
    await fireEvent.press(getByLabelText('Save profile'));

    await findByText('Saved');
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Demo Customer',
      phone: '+1 (555) 012-3456',
    });
  });

  it('lets a worker edit bio and specialties', async () => {
    const workerProfile = makeProfile({
      id: WORKER_ID,
      email: 'worker@homefix.test',
      role: 'worker',
      displayName: 'Demo Worker',
    });
    const getMe = jest.fn().mockResolvedValue(workerProfile);
    const updateProfile = jest
      .fn()
      .mockResolvedValue({ ...workerProfile, bio: 'Pro plumber', skills: ['plumbing'] });
    const client = { getMe, updateProfile } as unknown as ApiClient;

    const { findByLabelText, findByText, getByLabelText } = await render(
      <ProfileScreen client={client} />,
    );

    await fireEvent.changeText(await findByLabelText('Bio'), 'Pro plumber');
    await fireEvent.press(getByLabelText('Specialty plumbing'));
    await fireEvent.press(getByLabelText('Save profile'));

    await findByText('Saved');
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Demo Worker',
      phone: undefined,
      bio: 'Pro plumber',
      skills: ['plumbing'],
    });
  });

  it('hides bio and specialties for a non-worker', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const client = { getMe, updateProfile: jest.fn() } as unknown as ApiClient;

    const { findByText, queryByLabelText } = await render(<ProfileScreen client={client} />);
    await findByText('customer@homefix.test');
    expect(queryByLabelText('Bio')).toBeNull();
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
