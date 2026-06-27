import type { MessageSender, OutboundMessage } from './notificationProvider.ts';

export interface PushSenderConfig {
  /** The push endpoint, e.g. https://exp.host/--/api/v2/push/send for Expo. */
  apiUrl: string;
}

/** Minimal HTTP surface used to POST to the push endpoint; injectable for tests. */
export type PushHttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

const defaultClient: PushHttpClient = async (url, init) => {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status };
};

/**
 * Build a {@link MessageSender} that POSTs a notification to a push endpoint
 * (Expo's push API by default: `{ to, title, body }` to the configured URL). A
 * non-2xx response throws, so the composite delivery logs the failure and other
 * channels are unaffected. Only constructed when `PUSH_API_URL` is configured;
 * otherwise the push channel uses the inert logging sender.
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
  };
}
