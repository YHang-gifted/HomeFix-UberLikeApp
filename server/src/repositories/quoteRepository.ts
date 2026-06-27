import process from 'node:process';

import type { Quote } from '../../../shared/schemas.ts';
import { createPoolQueryable } from '../config/db.ts';
import { PostgresQuoteRepository } from './postgresQuoteRepository.ts';

/** A request's price quote. At most one quote exists per request. */
export interface QuoteRepository {
  save(quote: Quote): Promise<void>;
  findByRequest(requestId: string): Promise<Quote | undefined>;
  clear(): Promise<void>;
}

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly quotes = new Map<string, Quote>();

  public save(quote: Quote): Promise<void> {
    this.quotes.set(quote.id, quote);
    return Promise.resolve();
  }

  public findByRequest(requestId: string): Promise<Quote | undefined> {
    return Promise.resolve(
      [...this.quotes.values()].find((quote) => quote.requestId === requestId),
    );
  }

  public clear(): Promise<void> {
    this.quotes.clear();
    return Promise.resolve();
  }
}

export function selectQuoteRepository(databaseUrl: string | undefined): QuoteRepository {
  if (databaseUrl !== undefined && databaseUrl !== '') {
    return new PostgresQuoteRepository(createPoolQueryable(databaseUrl));
  }
  return new InMemoryQuoteRepository();
}

export const quoteRepository: QuoteRepository = selectQuoteRepository(process.env['DATABASE_URL']);
