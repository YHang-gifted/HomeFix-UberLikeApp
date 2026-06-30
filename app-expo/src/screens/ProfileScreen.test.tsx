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
      availability: 'available',
    });
  });

  it('lets a worker toggle availability to away', async () => {
    const workerProfile = makeProfile({
      id: WORKER_ID,
      email: 'worker@homefix.test',
      role: 'worker',
      displayName: 'Demo Worker',
    });
    const getMe = jest.fn().mockResolvedValue(workerProfile);
    const updateProfile = jest.fn().mockResolvedValue({ ...workerProfile, availability: 'away' });
    const client = { getMe, updateProfile } as unknown as ApiClient;

    const { findByLabelText, findByText, getByLabelText } = await render(
      <ProfileScreen client={client} />,
    );

    await fireEvent.press(await findByLabelText('Set away'));
    await fireEvent.press(getByLabelText('Save profile'));

    await findByText('Saved');
    expect(updateProfile).toHaveBeenCalledWith({
      displayName: 'Demo Worker',
      phone: undefined,
      bio: undefined,
      skills: undefined,
      availability: 'away',
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

  it('changes the password and shows confirmation', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const changePassword = jest.fn().mockResolvedValue(undefined);
    const client = { getMe, changePassword } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ProfileScreen client={client} />);
    await findByText('customer@homefix.test');

    await fireEvent.changeText(getByLabelText('Current password'), 'orig-pass-123');
    await fireEvent.changeText(getByLabelText('New password'), 'new-pass-456');
    await fireEvent.changeText(getByLabelText('Confirm new password'), 'new-pass-456');
    await fireEvent.press(getByLabelText('Change password'));

    await findByText('Password changed');
    expect(changePassword).toHaveBeenCalledWith('orig-pass-123', 'new-pass-456');
  });

  it('blocks a password change when the confirmation does not match', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const changePassword = jest.fn();
    const client = { getMe, changePassword } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ProfileScreen client={client} />);
    await findByText('customer@homefix.test');

    await fireEvent.changeText(getByLabelText('Current password'), 'orig-pass-123');
    await fireEvent.changeText(getByLabelText('New password'), 'new-pass-456');
    await fireEvent.changeText(getByLabelText('Confirm new password'), 'different-789');
    await fireEvent.press(getByLabelText('Change password'));

    await findByText('Passwords do not match');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('deletes the account after confirmation and signs out', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const deleteAccount = jest.fn().mockResolvedValue(undefined);
    const onDeleted = jest.fn();
    const client = { getMe, deleteAccount } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(
      <ProfileScreen client={client} onDeleted={onDeleted} />,
    );
    await findByText('customer@homefix.test');

    await fireEvent.press(getByLabelText('Confirm permanent deletion'));
    await fireEvent.changeText(getByLabelText('Password to delete account'), 'my-password-123');
    await fireEvent.press(getByLabelText('Delete account'));

    expect(deleteAccount).toHaveBeenCalledWith('my-password-123');
    expect(onDeleted).toHaveBeenCalled();
  });

  it('does not delete the account without confirmation', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const deleteAccount = jest.fn();
    const onDeleted = jest.fn();
    const client = { getMe, deleteAccount } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(
      <ProfileScreen client={client} onDeleted={onDeleted} />,
    );
    await findByText('customer@homefix.test');

    await fireEvent.changeText(getByLabelText('Password to delete account'), 'my-password-123');
    await fireEvent.press(getByLabelText('Delete account'));

    await findByText('Please confirm you understand this is permanent.');
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('logs out of other devices and persists the refreshed token', async () => {
    const getMe = jest.fn().mockResolvedValue(makeProfile());
    const logoutAll = jest.fn().mockResolvedValue(undefined);
    const getToken = jest.fn().mockReturnValue('fresh-token');
    const onTokenRefreshed = jest.fn();
    const client = { getMe, logoutAll, getToken } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(
      <ProfileScreen client={client} onTokenRefreshed={onTokenRefreshed} />,
    );
    await findByText('customer@homefix.test');

    await fireEvent.press(getByLabelText('Log out other devices'));

    await findByText('Logged out of other devices');
    expect(logoutAll).toHaveBeenCalled();
    expect(onTokenRefreshed).toHaveBeenCalledWith('fresh-token');
  });
});
