import type { LoginInput, Principal } from '../../../shared/schemas.ts';
import { signToken } from '../auth/jwt.ts';
import { verifyPassword } from '../auth/passwords.ts';
import { AppError } from '../errors/appError.ts';
import { userRepository } from '../repositories/userRepository.ts';

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
