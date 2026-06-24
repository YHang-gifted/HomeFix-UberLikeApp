import type { Role } from '../../../shared/schemas.ts';
import { hashPassword } from '../auth/passwords.ts';

export interface UserRecord {
  id: string;
  email: string;
  role: Role;
  passwordHash: string;
}

const users = new Map<string, UserRecord>();

function seed(id: string, email: string, role: Role, password: string): void {
  users.set(email.toLowerCase(), { id, email, role, passwordHash: hashPassword(password) });
}

// Demo seed users for local development only. Replace with a real user store.
seed('123e4567-e89b-12d3-a456-426614174000', 'customer@homefix.test', 'customer', 'customer-pass');
seed('323e4567-e89b-12d3-a456-426614174000', 'admin@homefix.test', 'admin', 'admin-pass');
seed('423e4567-e89b-12d3-a456-426614174000', 'worker@homefix.test', 'worker', 'worker-pass');

export function findUserByEmail(email: string): UserRecord | undefined {
  return users.get(email.toLowerCase());
}

export function listUsersByRole(role: Role): UserRecord[] {
  return [...users.values()].filter((user) => user.role === role);
}

export function findUserById(id: string): UserRecord | undefined {
  return [...users.values()].find((user) => user.id === id);
}
