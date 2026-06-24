import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { NotificationList } from '../../../shared/schemas';
import { AlertsButton } from './AlertsButton';

function makeList(unreadCount: number): NotificationList {
  return { items: [], unreadCount };
}

describe('AlertsButton', () => {
  it('shows an unread badge with the count from the client', async () => {
    const listNotifications = jest.fn().mockResolvedValue(makeList(3));
    const client = { listNotifications } as unknown as ApiClient;

    const { findByLabelText, findByText } = await render(<AlertsButton client={client} />);

    await findByLabelText('Notifications, 3 unread');
    await findByText('3');
  });

  it('shows no badge when there are no unread notifications', async () => {
    const listNotifications = jest.fn().mockResolvedValue(makeList(0));
    const client = { listNotifications } as unknown as ApiClient;

    const { findByLabelText, queryByText } = await render(<AlertsButton client={client} />);

    await findByLabelText('Notifications');
    expect(queryByText('0')).toBeNull();
  });

  it('calls onPress when tapped', async () => {
    const listNotifications = jest.fn().mockResolvedValue(makeList(2));
    const client = { listNotifications } as unknown as ApiClient;
    const onPress = jest.fn();

    const { findByLabelText } = await render(<AlertsButton client={client} onPress={onPress} />);

    await fireEvent.press(await findByLabelText('Notifications, 2 unread'));

    await waitFor(() => {
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
