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
  {
    id: '0009_payments',
    sql: `
      CREATE TABLE IF NOT EXISTS payments (
        id uuid PRIMARY KEY,
        request_id uuid NOT NULL UNIQUE,
        customer_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        amount_cents integer NOT NULL,
        currency text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        paid_at timestamptz
      )
    `,
  },
  {
    id: '0010_quotes',
    sql: `
      CREATE TABLE IF NOT EXISTS quotes (
        id uuid PRIMARY KEY,
        request_id uuid NOT NULL UNIQUE,
        customer_id uuid NOT NULL,
        worker_id uuid NOT NULL,
        amount_cents integer NOT NULL,
        currency text NOT NULL,
        note text,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        responded_at timestamptz
      )
    `,
  },
  {
    id: '0011_device_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS device_tokens (
        user_id uuid NOT NULL,
        token text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, token)
      )
    `,
  },
  {
    id: '0012_review_reply',
    sql: `
      ALTER TABLE reviews
        ADD COLUMN IF NOT EXISTS reply text,
        ADD COLUMN IF NOT EXISTS replied_at timestamptz
    `,
  },
  {
    id: '0013_service_request_scheduled_at',
    sql: `
      ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS scheduled_at timestamptz
    `,
  },
  {
    id: '0014_user_bio_skills',
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS bio text,
        ADD COLUMN IF NOT EXISTS skills jsonb
    `,
  },
  {
    id: '0015_user_availability',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS availability text
    `,
  },
  {
    // Indexes on the columns that back WHERE-filtered repository queries
    // (payments by customer/worker/status, reviews by worker/request,
    // notifications by user, messages by request, audit by resource) and the
    // natural access paths on service_requests. Performance only — no behaviour
    // change. Each statement is idempotent (IF NOT EXISTS).
    id: '0016_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_service_requests_customer_id ON service_requests (customer_id);
      CREATE INDEX IF NOT EXISTS idx_service_requests_worker_id ON service_requests (worker_id);
      CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests (status);
      CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments (customer_id);
      CREATE INDEX IF NOT EXISTS idx_payments_worker_id ON payments (worker_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
      CREATE INDEX IF NOT EXISTS idx_reviews_worker_id ON reviews (worker_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_request_id ON reviews (request_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_request_id ON messages (request_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_resource_id ON audit_events (resource_id)
    `,
  },
  {
    // CHECK constraints that enforce the domain invariants the app already
    // validates at its boundary (status/role/availability enums, rating range,
    // positive money amounts) at the database level too. Each is written as a
    // DROP IF EXISTS + ADD pair so the migration is idempotent (a multi-statement
    // migration is not transactional and may re-run after a partial failure).
    id: '0017_check_constraints',
    sql: `
      ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS chk_service_requests_status;
      ALTER TABLE service_requests ADD CONSTRAINT chk_service_requests_status CHECK (status IN ('pending', 'matched', 'accepted', 'in_progress', 'completed', 'cancelled'));
      ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;
      ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('customer', 'worker', 'admin'));
      ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_availability;
      ALTER TABLE users ADD CONSTRAINT chk_users_availability CHECK (availability IS NULL OR availability IN ('available', 'away'));
      ALTER TABLE reviews DROP CONSTRAINT IF EXISTS chk_reviews_rating;
      ALTER TABLE reviews ADD CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5);
      ALTER TABLE quotes DROP CONSTRAINT IF EXISTS chk_quotes_status;
      ALTER TABLE quotes ADD CONSTRAINT chk_quotes_status CHECK (status IN ('pending', 'accepted', 'declined'));
      ALTER TABLE quotes DROP CONSTRAINT IF EXISTS chk_quotes_amount;
      ALTER TABLE quotes ADD CONSTRAINT chk_quotes_amount CHECK (amount_cents > 0);
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_status;
      ALTER TABLE payments ADD CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'paid'));
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_amount;
      ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount_cents > 0)
    `,
  },
  {
    // Foreign keys, part 1 of the FK hardening: the central service_requests
    // table references users. Added NOT VALID so the constraint is enforced for
    // all new/updated rows but the existing rows on the live database are not
    // re-checked on boot (this app has no delete flows, so no orphans are
    // expected, but NOT VALID keeps a stray legacy row from blocking startup).
    // DROP IF EXISTS + ADD keeps each statement idempotent.
    id: '0018_fk_service_requests',
    sql: `
      ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS fk_service_requests_customer;
      ALTER TABLE service_requests ADD CONSTRAINT fk_service_requests_customer FOREIGN KEY (customer_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS fk_service_requests_worker;
      ALTER TABLE service_requests ADD CONSTRAINT fk_service_requests_worker FOREIGN KEY (worker_id) REFERENCES users (id) NOT VALID
    `,
  },
  {
    // FK hardening part 2: the billing tables (quotes, payments) reference both
    // their service_request and the customer/worker users. NOT VALID + DROP IF
    // EXISTS pairs, same as 0018.
    id: '0019_fk_quotes_payments',
    sql: `
      ALTER TABLE quotes DROP CONSTRAINT IF EXISTS fk_quotes_request;
      ALTER TABLE quotes ADD CONSTRAINT fk_quotes_request FOREIGN KEY (request_id) REFERENCES service_requests (id) NOT VALID;
      ALTER TABLE quotes DROP CONSTRAINT IF EXISTS fk_quotes_customer;
      ALTER TABLE quotes ADD CONSTRAINT fk_quotes_customer FOREIGN KEY (customer_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE quotes DROP CONSTRAINT IF EXISTS fk_quotes_worker;
      ALTER TABLE quotes ADD CONSTRAINT fk_quotes_worker FOREIGN KEY (worker_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_request;
      ALTER TABLE payments ADD CONSTRAINT fk_payments_request FOREIGN KEY (request_id) REFERENCES service_requests (id) NOT VALID;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_customer;
      ALTER TABLE payments ADD CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_worker;
      ALTER TABLE payments ADD CONSTRAINT fk_payments_worker FOREIGN KEY (worker_id) REFERENCES users (id) NOT VALID
    `,
  },
  {
    // FK hardening part 3: reviews, notifications, and messages reference their
    // service_request and the users involved (notifications.request_id is
    // nullable, so its FK permits NULL). NOT VALID + DROP IF EXISTS pairs.
    id: '0020_fk_reviews_notifications_messages',
    sql: `
      ALTER TABLE reviews DROP CONSTRAINT IF EXISTS fk_reviews_request;
      ALTER TABLE reviews ADD CONSTRAINT fk_reviews_request FOREIGN KEY (request_id) REFERENCES service_requests (id) NOT VALID;
      ALTER TABLE reviews DROP CONSTRAINT IF EXISTS fk_reviews_customer;
      ALTER TABLE reviews ADD CONSTRAINT fk_reviews_customer FOREIGN KEY (customer_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE reviews DROP CONSTRAINT IF EXISTS fk_reviews_worker;
      ALTER TABLE reviews ADD CONSTRAINT fk_reviews_worker FOREIGN KEY (worker_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_user;
      ALTER TABLE notifications ADD CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_request;
      ALTER TABLE notifications ADD CONSTRAINT fk_notifications_request FOREIGN KEY (request_id) REFERENCES service_requests (id) NOT VALID;
      ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_request;
      ALTER TABLE messages ADD CONSTRAINT fk_messages_request FOREIGN KEY (request_id) REFERENCES service_requests (id) NOT VALID;
      ALTER TABLE messages DROP CONSTRAINT IF EXISTS fk_messages_sender;
      ALTER TABLE messages ADD CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users (id) NOT VALID
    `,
  },
  {
    // FK hardening part 4 (final): favorites, device_tokens, and audit_events
    // reference users. audit_events.resource_id is polymorphic (it points at a
    // request, payment, etc., depending on the action) so it is intentionally
    // left without a FK. NOT VALID + DROP IF EXISTS pairs.
    id: '0021_fk_favorites_device_tokens_audit',
    sql: `
      ALTER TABLE favorites DROP CONSTRAINT IF EXISTS fk_favorites_customer;
      ALTER TABLE favorites ADD CONSTRAINT fk_favorites_customer FOREIGN KEY (customer_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE favorites DROP CONSTRAINT IF EXISTS fk_favorites_worker;
      ALTER TABLE favorites ADD CONSTRAINT fk_favorites_worker FOREIGN KEY (worker_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE device_tokens DROP CONSTRAINT IF EXISTS fk_device_tokens_user;
      ALTER TABLE device_tokens ADD CONSTRAINT fk_device_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
      ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS fk_audit_events_actor;
      ALTER TABLE audit_events ADD CONSTRAINT fk_audit_events_actor FOREIGN KEY (actor_id) REFERENCES users (id) NOT VALID
    `,
  },
  {
    // Token revocation: each user has a token_version that is embedded in their
    // JWTs. Bumping it (logout-all, password change) invalidates every previously
    // issued token. Existing tokens that predate this column carry no version and
    // are treated as version 0, matching the default, so no one is logged out by
    // the migration itself.
    id: '0022_user_token_version',
    sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0`,
  },
  {
    // Password reset: short-lived, single-use tokens. Only a SHA-256 hash of the
    // token is stored; the plaintext is emailed to the user. A new table, so the
    // user_id FK is validated inline (no existing rows to scan).
    id: '0023_password_reset_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id),
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `,
  },
  {
    // Account lifecycle status. `active` is the default for every existing and
    // new row; `suspended` blocks sign-in (admin action); `deleted` is the
    // soft-delete state (the row is kept so the FK graph stays intact, but its
    // PII is scrubbed). The CHECK is a DROP IF EXISTS + ADD pair so the
    // multi-statement migration is idempotent.
    id: '0024_user_status',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
      ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_status;
      ALTER TABLE users ADD CONSTRAINT chk_users_status CHECK (status IN ('active', 'suspended', 'deleted'))
    `,
  },
  {
    // Marketplace split: the platform's commission on each payment (Model B).
    // worker_net is derived (amount - fee) so only the fee is stored. Existing
    // rows default to 0 (no commission was taken historically). The CHECK keeps
    // the fee within the gross amount. DROP IF EXISTS + ADD keeps it idempotent.
    id: '0025_payment_platform_fee',
    sql: `
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0;
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_platform_fee;
      ALTER TABLE payments ADD CONSTRAINT chk_payments_platform_fee CHECK (platform_fee_cents >= 0 AND platform_fee_cents <= amount_cents)
    `,
  },
  {
    // Refunds: a paid payment can be reversed to 'refunded'. Widen the status
    // CHECK to admit the new terminal state. DROP IF EXISTS + ADD keeps it
    // idempotent; the refund timestamp lives on the audit event, so no column.
    id: '0026_payment_refunded_status',
    sql: `
      ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payments_status;
      ALTER TABLE payments ADD CONSTRAINT chk_payments_status CHECK (status IN ('pending', 'paid', 'refunded'))
    `,
  },
  {
    // Payouts of the worker's net (Model B). One per payment (payment_id UNIQUE);
    // FKs are validated inline (new table, no legacy rows to scan). The index
    // backs the worker's payout-history lookup.
    id: '0027_payouts',
    sql: `
      CREATE TABLE IF NOT EXISTS payouts (
        id uuid PRIMARY KEY,
        payment_id uuid NOT NULL UNIQUE REFERENCES payments (id),
        worker_id uuid NOT NULL REFERENCES users (id),
        amount_cents integer NOT NULL,
        currency text NOT NULL,
        status text NOT NULL,
        created_at timestamptz NOT NULL,
        paid_at timestamptz,
        CONSTRAINT chk_payouts_status CHECK (status IN ('pending', 'paid')),
        CONSTRAINT chk_payouts_amount CHECK (amount_cents > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_payouts_worker_id ON payouts (worker_id)
    `,
  },
  {
    // Per-user notification channel preferences. Both default to true so existing
    // users keep receiving everything until they opt out. A channel is delivered
    // only when globally enabled (NOTIFY_CHANNELS) AND the recipient wants it.
    id: '0028_user_notification_prefs',
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT true
    `,
  },
  {
    // The payment provider's reference for a charge (mock provider assigns one).
    // A partial unique index keeps the mapping one provider-ref → one payment,
    // which is how a provider's webhook resolves back to our payment.
    id: '0029_payments_provider_ref',
    sql: `
      ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_ref text;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_ref
        ON payments (provider_ref) WHERE provider_ref IS NOT NULL
    `,
  },
];
