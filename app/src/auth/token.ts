import type { Principal } from '../../../shared/schemas.ts';
import { principalSchema } from '../../../shared/schemas.ts';

function base64UrlDecode(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}

/**
 * Reads the principal (id + role) from a JWT's payload WITHOUT verifying the
 * signature. This is for client-side convenience only (e.g. knowing the current
 * user's id to build a request); the server always re-verifies the token.
 * Returns null for any malformed token.
 */
export function getPrincipalFromToken(token: string): Principal | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }
  const payloadSegment = segments[1];
  if (payloadSegment === undefined) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(payloadSegment));
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const claims = payload as { sub?: unknown; role?: unknown };
  const result = principalSchema.safeParse({ id: claims.sub, role: claims.role });
  return result.success ? result.data : null;
}
