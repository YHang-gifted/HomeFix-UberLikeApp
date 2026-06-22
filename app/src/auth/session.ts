import type { ApiClient } from '../services/apiClient.ts';

/**
 * Persistent storage for the auth token. The default implementation is
 * platform-specific (secure storage on native, web storage on web) and lives in
 * the app project; this interface keeps the session logic testable in isolation.
 */
export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Restore a session on app launch: load any stored token, apply it to the
 * client, and confirm it decodes to a principal. A token that is missing or
 * malformed results in a signed-out state (and is cleared from storage).
 * Returns true when a usable session was restored.
 */
export async function restoreSession(store: TokenStore, client: ApiClient): Promise<boolean> {
  const token = await store.get();
  if (token === null) {
    return false;
  }

  client.setToken(token);
  if (client.getPrincipal() === null) {
    client.setToken(undefined);
    await store.clear();
    return false;
  }
  return true;
}

/** Persist a freshly issued token and apply it to the client. */
export async function persistSession(
  store: TokenStore,
  client: ApiClient,
  token: string,
): Promise<void> {
  client.setToken(token);
  await store.set(token);
}

/** Sign out: drop the in-memory token and remove it from storage. */
export async function clearSession(store: TokenStore, client: ApiClient): Promise<void> {
  client.setToken(undefined);
  await store.clear();
}
