import type { MessageSender, OutboundMessage } from './notificationProvider.ts';

export interface EmailSenderConfig {
  apiUrl: string;
  apiKey: string;
  from: string;
}

/** Minimal HTTP surface used to POST to the email provider; injectable for tests. */
export type EmailHttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

const defaultClient: EmailHttpClient = async (url, init) => {
  const response = await fetch(url, init);
  return { ok: response.ok, status: response.status };
};

/**
 * Build a {@link MessageSender} that POSTs a notification to an HTTP email
 * provider (a generic JSON `{ from, to, subject, text }` payload with a bearer
 * key). A non-2xx response throws, so the composite delivery logs the failure and
 * other channels are unaffected. Only constructed when `EMAIL_*` is configured;
 * otherwise the email channel uses the inert logging sender.
 */
export function createHttpEmailSender(
  config: EmailSenderConfig,
  client: EmailHttpClient = defaultClient,
): MessageSender {
  return async (message: OutboundMessage): Promise<void> => {
    const response = await client(config.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      }),
    });
    if (!response.ok) {
      throw new Error(`Email provider responded ${String(response.status)}`);
    }
  };
}
