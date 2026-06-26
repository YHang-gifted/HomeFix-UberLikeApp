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
  {
    id: '0002_audit_events',
    sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        id uuid PRIMARY KEY,
        occurred_at timestamptz NOT NULL,
        actor_id uuid NOT NULL,
        actor_role text NOT NULL,
        action text NOT NULL,
        resource_id uuid NOT NULL,
        details jsonb
      )
    `,
  },
  {
    id: '0003_reviews',
    sql: `
      CREATE TABLE IF NOT EXISTS reviews (
        id uuid PRIMARY KEY,
        request_id uuid NOT NULL,
        customer_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        rating integer NOT NULL,
        comment text,
        created_at timestamptz NOT NULL
      )
    `,
  },
  {
    id: '0004_notifications',
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL,
        message text NOT NULL,
        request_id uuid,
        read boolean NOT NULL,
        created_at timestamptz NOT NULL
      )
    `,
  },
  {
    id: '0005_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        role text NOT NULL,
        display_name text NOT NULL,
        phone text,
        password_hash text NOT NULL
      )
    `,
  },
  {
    id: '0006_service_request_photos',
    sql: `
      ALTER TABLE service_requests
        ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb
    `,
  },
  {
    id: '0007_favorites',
    sql: `
      CREATE TABLE IF NOT EXISTS favorites (
        customer_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        PRIMARY KEY (customer_id, worker_id)
      )
    `,
  },
  {
    id: '0008_messages',
    sql: `
      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY,
        request_id uuid NOT NULL,
        sender_id uuid NOT NULL,
        sender_role text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL
      )
    `,
  },
];
