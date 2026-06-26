import type { Message } from '../../../shared/schemas.ts';
import { messageSchema } from '../../../shared/schemas.ts';
import type { MessageRepository } from './messageRepository.ts';
import type { Queryable } from '../db/queryable.ts';

const INSERT = `
  INSERT INTO messages
    (id, request_id, sender_id, sender_role, body, created_at)
  VALUES ($1, $2, $3, $4, $5, $6)
`;

interface MessageRow {
  id: string;
  request_id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  created_at: string | Date;
}

function mapRow(row: unknown): Message {
  const r = row as MessageRow;
  return messageSchema.parse({
    id: r.id,
    requestId: r.request_id,
    senderId: r.sender_id,
    senderRole: r.sender_role,
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
  });
}

export class PostgresMessageRepository implements MessageRepository {
  private readonly db: Queryable;

  public constructor(db: Queryable) {
    this.db = db;
  }

  public async save(message: Message): Promise<void> {
    await this.db.query(INSERT, [
      message.id,
      message.requestId,
      message.senderId,
      message.senderRole,
      message.body,
      message.createdAt,
    ]);
  }

  public async listByRequest(requestId: string): Promise<Message[]> {
    const result = await this.db.query(
      'SELECT * FROM messages WHERE request_id = $1 ORDER BY created_at ASC',
      [requestId],
    );
    return result.rows.map(mapRow);
  }

  public async clear(): Promise<void> {
    await this.db.query('DELETE FROM messages');
  }
}
