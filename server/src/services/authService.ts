import { randomUUID } from 'node:crypto';

import type { LoginInput, Principal, RegisterInput } from '../../../shared/schemas.ts';
import { signToken } from '../auth/jwt.ts';
import { hashPassword, verifyPassword } from '../auth/passwords.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';
import type { UserRecord } from '../repositories/userRepository.ts';

export interface LoginResult {
  token: string;
  principal: Principal;
}

export async function login(input: LoginInput): Promise<LoginResult> {
  const user = await userRepository.findByEmail(input.email);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    throw new AppError('Invalid email or password', 401);
  }
  const principal: Principal = { id: user.id, role: user.role };
  return { token: signToken(principal), principal };
}

/** Create a new customer or worker account and sign them in. */
export async function registerUser(input: RegisterInput): Promise<LoginResult> {
  const existing = await userRepository.findByEmail(input.email);
  if (existing) {
    throw new AppError('An account with this email already exists', 409);
  }
  const user: UserRecord = {
    id: randomUUID(),
    email: input.email,
    role: input.role,
    displayName: input.displayName,
    passwordHash: hashPassword(input.password),
  };
  await userRepository.create(user);
  const principal: Principal = { id: user.id, role: user.role };
  return { token: signToken(principal), principal };
}
