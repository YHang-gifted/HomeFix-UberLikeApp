import type { ApiClient } from '../../services/apiClient.ts';
import { isApiError } from '../../services/apiClient.ts';

/** Roles a user may self-register as (admins are created out-of-band). */
export type RegisterRole = 'customer' | 'worker';

export interface RegisterSuccess {
  ok: true;
  token: string;
}

export interface RegisterFailure {
  ok: false;
  message: string;
}

export type RegisterOutcome = RegisterSuccess | RegisterFailure;

export async function performRegister(
  client: ApiClient,
  input: { email: string; password: string; displayName: string; role: RegisterRole },
): Promise<RegisterOutcome> {
  try {
    const token = await client.register(input);
    return { ok: true, token };
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      return { ok: false, message: 'An account with this email already exists.' };
    }
    if (isApiError(error) && error.status === 422) {
      return { ok: false, message: 'Please check your details and try again.' };
    }
    return { ok: false, message: 'Could not reach the server. Please try again.' };
  }
}
