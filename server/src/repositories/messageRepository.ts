import type { Message } from '../../../shared/schemas.ts';

/** Messages exchanged between a request's parties, scoped per request. */
export interface MessageRepository {
  save(message: Message): Promise<void>;
  listByRequest(requestId: string): Promise<Message[]>;
  clear(): Promise<void>;
}

export class InMemoryMessageRepository implements MessageRepository {
  private readonly messages = new Map<string, Message>();

  public save(message: Message): Promise<void> {
    this.messages.set(message.id, message);
    return Promise.resolve();
  }

  public listByRequest(requestId: string): Promise<Message[]> {
    const items = [...this.messages.values()]
      .filter((message) => message.requestId === requestId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.resolve(items);
  }

  public clear(): Promise<void> {
    this.messages.clear();
    return Promise.resolve();
  }
}

// In-memory only for now; slice 58b adds PostgresMessageRepository + a
// DATABASE_URL-based selector + migration, mirroring the other domains.
export const messageRepository: MessageRepository = new InMemoryMessageRepository();
