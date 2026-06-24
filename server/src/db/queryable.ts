/** Minimal SQL execution surface implemented by pg.Pool (see config/db.ts) and PGlite in tests. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}
