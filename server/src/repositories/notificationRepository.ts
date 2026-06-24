import process from 'node:process';

import type { Notification } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresNotificationRepository } from './postgresNotificationRepository.ts';

export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  findByUser(userId: string): Promise<Notification[]>;
  markRead(id: string, userId: string): Promise<Notification | undefined>;
  clear(): Promise<void>;
}

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly notifications = new Map<string, Notification>();

  public save(notification: Notification): Promise<void> {
    this.notifications.set(notification.id, notification);
    return Promise.resolve();
  }

  public findByUser(userId: string): Promise<Notification[]> {
    return Promise.resolve(
      [...this.notifications.values()].filter((notification) => notification.userId === userId),
    );
  }

  public markRead(id: string, userId: string): Promise<Notification | undefined> {
    const existing = this.notifications.get(id);
    if (!existing || existing.userId !== userId) {
      return Promise.resolve(undefined);
    }
    const updated: Notification = { ...existing, read: true };
    this.notifications.set(id, updated);
    return Promise.resolve(updated);
  }

  public clear(): Promise<void> {
    this.notifications.clear();
    return Promise.resolve();
  }
}

export function selectNotificationRepository(
  databaseUrl: string | undefined,
): NotificationRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresNotificationRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryNotificationRepository();
}

export const notificationRepository: NotificationRepository = selectNotificationRepository(
  process.env['DATABASE_URL'],
);
