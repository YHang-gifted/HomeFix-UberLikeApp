import { hashPassword } from '../auth/passwords.ts';
import { DEMO_USERS } from '../repositories/userRepository.ts';
import type { Queryable } from './queryable.ts';

const UPSERT = `
  INSERT INTO users (id, email, role, display_name, password_hash)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (id) DO NOTHING
`;

/**
 * Idempotently insert the demo users into a Postgres database (local/dev only).
 * A no-op for users that already exist. Mirrors the seeding the in-memory
 * repository does in its constructor.
 */
export async function seedDemoUsers(db: Queryable): Promise<void> {
  await Promise.all(
    DEMO_USERS.map((user) =>
      db.query(UPSERT, [
        user.id,
        user.email,
        user.role,
        user.displayName,
        hashPassword(user.password),
      ]),
    ),
  );
}
