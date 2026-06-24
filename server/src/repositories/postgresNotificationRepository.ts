import type { Notification } from '../../../shared/schemas.ts';
import { notificationSchema } from '../../../shared/schemas.ts';
import type { NotificationRepository } from './notificationRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const INSERT = `
  INSERT INTO notifications
    (id, user_id, message, request_id, read, created_at)
  VALUES ($1, $2, $3, $4, $5, $6)
`;

interface NotificationRow {
  id: string;
  user_id: string;
  message: string;
  request_id: string | null;
  read: boolean;
  created_at: string | Date;
}

function mapRow(row: unknown): Notification {
  const r = row as NotificationRow;
  const candidate = {
    id: r.id,
    userId: r.user_id,
    message: r.message,
    read: r.read,
    createdAt: new Date(r.created_at).toISOString(),
    ...(r.request_id !== null ? { requestId: r.request_id } : {}),
  };
  return notificationSchema.parse(candidate);
}

export class PostgresNotificationRepository implements NotificationRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(notification: Notification): Promise<void> {
    await this.db.query(INSERT, [
      notification.id,
      notification.userId,
      notification.message,
      notification.requestId ?? null,
      notification.read,
      notification.createdAt,
    ]);
  }

  public async findByUser(userId: string): Promise<Notification[]> {
    const result = await this.db.query('SELECT * FROM notifications WHERE user_id = $1', [userId]);
    return result.rows.map(mapRow);
  }

  public async markRead(id: string, userId: string): Promise<Notification | undefined> {
    const result = await this.db.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId],
    );
    const row = result.rows[0];
    return row === undefined ? undefined : mapRow(row);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM notifications');
  }
}
