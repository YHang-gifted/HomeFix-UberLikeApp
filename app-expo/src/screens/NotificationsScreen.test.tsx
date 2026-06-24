import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Notification, NotificationList } from '../../../shared/schemas';
import { NotificationsScreen } from './NotificationsScreen';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    userId: '423e4567-e89b-12d3-a456-426614174000',
    message: 'You were assigned a new request.',
    read: false,
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function makeList(items: Notification[]): NotificationList {
  return { items, unreadCount: items.filter((item) => !item.read).length };
}

describe('NotificationsScreen', () => {
  it('renders notifications with an unread count', async () => {
    const listNotifications = jest.fn().mockResolvedValue(makeList([makeNotification()]));
    const client = { listNotifications } as unknown as ApiClient;

    const { findByText } = await render(<NotificationsScreen client={client} />);

    await findByText('You were assigned a new request.');
    await findByText('Unread: 1');
  });

  it('marks a notification read when tapped', async () => {
    const notification = makeNotification();
    const listNotifications = jest
      .fn()
      .mockResolvedValueOnce(makeList([notification]))
      .mockResolvedValueOnce(makeList([{ ...notification, read: true }]));
    const markNotificationRead = jest.fn().mockResolvedValue({ ...notification, read: true });
    const client = { listNotifications, markNotificationRead } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<NotificationsScreen client={client} />);
    await findByText('You were assigned a new request.');
    await fireEvent.press(getByLabelText('Notification: You were assigned a new request.'));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith(notification.id);
    });
  });
});
