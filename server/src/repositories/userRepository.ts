import type { Role } from '../../../shared/schemas.ts';
import { hashPassword } from '../auth/passwords.ts';

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  passwordHash: string;
}

const users = new Map<string, UserRecord>();

function seed(id: string, email: string, role: Role, displayName: string, password: string): void {
  users.set(email.toLowerCase(), {
    id,
    email,
    role,
    displayName,
    passwordHash: hashPassword(password),
  });
}

// Demo seed users for local development only. Replace with a real user store.
seed(
  '123e4567-e89b-12d3-a456-426614174000',
  'customer@homefix.test',
  'customer',
  'Demo Customer',
  'customer-pass',
);
seed(
  '323e4567-e89b-12d3-a456-426614174000',
  'admin@homefix.test',
  'admin',
  'Demo Admin',
  'admin-pass',
);
seed(
  '423e4567-e89b-12d3-a456-426614174000',
  'worker@homefix.test',
  'worker',
  'Demo Worker',
  'worker-pass',
);

export function findUserByEmail(email: string): UserRecord | undefined {
  return users.get(email.toLowerCase());
}

export function listUsersByRole(role: Role): UserRecord[] {
  return [...users.values()].filter((user) => user.role === role);
}

export function findUserById(id: string): UserRecord | undefined {
  return [...users.values()].find((user) => user.id === id);
}

export function updateUserDisplayName(id: string, displayName: string): UserRecord | undefined {
  const user = findUserById(id);
  if (!user) {
    return undefined;
  }
  const updated: UserRecord = { ...user, displayName };
  users.set(user.email.toLowerCase(), updated);
  return updated;
}
