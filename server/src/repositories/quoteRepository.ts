import type { Quote } from '../../../shared/schemas.ts';

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

// In-memory only for now; a Postgres-backed repository + factory follow in the
// next slice (mirroring payments).
export const quoteRepository: QuoteRepository = new InMemoryQuoteRepository();
