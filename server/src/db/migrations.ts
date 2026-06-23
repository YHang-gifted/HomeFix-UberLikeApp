export interface Migration {
  id: string;
  sql: string;
}

// Ordered, append-only list of schema migrations. Each runs once and is tracked
// in the schema_migrations table. Never edit an applied migration's SQL — add a
// new one instead.
export const migrations: Migration[] = [
  {
    id: '0001_service_requests',
    sql: `
      CREATE TABLE IF NOT EXISTS service_requests (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL,
        worker_id uuid,
        category text NOT NULL,
        description text NOT NULL,
        latitude double precision NOT NULL,
        longitude double precision NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `,
  },
];
