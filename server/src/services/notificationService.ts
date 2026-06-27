import { randomUUID } from 'node:crypto';

import type { Notification, NotificationList, Principal } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { notificationRepository } from '../repositories/notificationRepository.ts';
import { notificationDelivery, resetDeliveries } from './notificationDelivery.ts';
import { logger } from '../utils/logger.ts';

/** Create a notification for a recipient. Never throws to the calling flow. */
export async function recordNotification(params: {
  userId: string;
  message: string;
  requestId?: string;
}): Promise<void> {
  const notification: Notification = {
    id: randomUUID(),
    userId: params.userId,
    message: params.message,
    read: false,
    createdAt: new Date().toISOString(),
    ...(params.requestId !== undefined ? { requestId: params.requestId } : {}),
  };
  await notificationRepository.save(notification);
  // Fan out to external channels (email/push). Delivery is best-effort: a
  // failure here must never break the action that triggered the notification.
  try {
    await notificationDelivery.deliver(notification);
  } catch (error) {
    logger.error(
      `Notification delivery error: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

/** The authenticated user's notifications, most recent first, with an unread count. */
export async function listNotifications(principal: Principal): Promise<NotificationList> {
  const all = await notificationRepository.findByUser(principal.id);
  const items = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const unreadCount = items.filter((notification) => !notification.read).length;
  return { items, unreadCount };
}

/** Mark one of the user's own notifications as read. */
export async function markNotificationRead(
  principal: Principal,
  id: string,
): Promise<Notification> {
  const updated = await notificationRepository.markRead(id, principal.id);
  if (!updated) {
    throw new AppError('Notification not found', 404);
  }
  return updated;
}

/** Mark all of the user's notifications as read, returning the refreshed list. */
export async function markAllNotificationsRead(principal: Principal): Promise<NotificationList> {
  await notificationRepository.markAllRead(principal.id);
  return listNotifications(principal);
}

export async function resetNotifications(): Promise<void> {
  await notificationRepository.clear();
  resetDeliveries();
}
