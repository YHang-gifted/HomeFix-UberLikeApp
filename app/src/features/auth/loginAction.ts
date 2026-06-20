import type { ApiClient } from '../../services/apiClient.ts';
import { ApiError } from '../../services/apiClient.ts';

export interface LoginSuccess {
  ok: true;
  token: string;
}

export interface LoginFailure {
  ok: false;
  message: string;
}

export type LoginOutcome = LoginSuccess | LoginFailure;

export async function performLogin(
  client: ApiClient,
  email: string,
  password: string,
): Promise<LoginOutcome> {
  try {
    const token = await client.login(email, password);
    return { ok: true, token };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return { ok: false, message: 'Incorrect email or password' };
    }
    return { ok: false, message: 'Could not reach the server. Please try again.' };
  }
}
