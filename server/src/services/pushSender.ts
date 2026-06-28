import type { MessageSender, OutboundMessage } from './notificationProvider.ts';

export interface PushSenderConfig {
  /** The push endpoint, e.g. https://exp.host/--/api/v2/push/send for Expo. */
  apiUrl: string;
}

/** Minimal HTTP surface used to POST to the push endpoint; injectable for tests. */
export type PushHttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; data?: unknown }>;

const defaultClient: PushHttpClient = async (url, init) => {
  const response = await fetch(url, init);
  // The Expo push API returns 200 even when an individual push ticket failed, so
  // the body must be inspected. Parsing is best-effort: a non-JSON body yields
  // undefined and is treated as "no ticket errors" (the HTTP status already passed).
  const data: unknown = await response.json().catch(() => undefined);
  return { ok: response.ok, status: response.status, data };
};

/**
 * Pull the human-readable messages of any failed Expo push tickets out of the
 * response body. Expo returns `{ data: ticket | ticket[] }` where each ticket is
 * `{ status: 'ok' | 'error', message?, details? }`; only `error` tickets matter.
 */
function expoTicketErrors(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) {
    return [];
  }
  const payload = (data as { data?: unknown }).data;
  const tickets = Array.isArray(payload) ? payload : payload !== undefined ? [payload] : [];
  const errors: string[] = [];
  for (const ticket of tickets) {
    if (
      typeof ticket === 'object' &&
      ticket !== null &&
      (ticket as { status?: unknown }).status === 'error'
    ) {
      const message = (ticket as { message?: unknown }).message;
      errors.push(typeof message === 'string' ? message : 'unknown push error');
    }
  }
  return errors;
}

/**
 * Build a {@link MessageSender} that POSTs a notification to a push endpoint
 * (Expo's push API by default: `{ to, title, body }` to the configured URL). A
 * non-2xx response throws; so does a 2xx response whose body reports a failed
 * push ticket (e.g. `DeviceNotRegistered`), since Expo returns 200 even then.
 * The composite delivery logs the failure and other channels are unaffected.
 * Only constructed when `PUSH_API_URL` is configured; otherwise the push channel
 * uses the inert logging sender.
 */
export function createExpoPushSender(
  config: PushSenderConfig,
  client: PushHttpClient = defaultClient,
): MessageSender {
  return async (message: OutboundMessage): Promise<void> => {
    const response = await client(config.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        to: message.to,
        title: message.subject,
        body: message.body,
      }),
    });
    if (!response.ok) {
      throw new Error(`Push provider responded ${String(response.status)}`);
    }
    const errors = expoTicketErrors(response.data);
    if (errors.length > 0) {
      throw new Error(`Push delivery failed: ${errors.join('; ')}`);
    }
  };
}
