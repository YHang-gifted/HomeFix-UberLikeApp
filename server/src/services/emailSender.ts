import type { MessageSender, OutboundMessage } from './notificationProvider.ts';

export interface EmailSenderConfig {
  apiUrl: string;
  apiKey: string;
  from: string;
}

/**
 * Minimal HTTP surface used to POST to the email provider; injectable for tests.
 *
 * `body` carries the provider's *response* text on a failure. A status code alone is not
 * actionable — the overwhelmingly common failure when standing this up is a 403 whose body
 * says exactly what is wrong ("the domain is not verified", "invalid from address"), and
 * without it the operator is left guessing at a number.
 */
export type EmailHttpClient = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; body?: string }>;

const defaultClient: EmailHttpClient = async (url, init) => {
  const response = await fetch(url, init);
  if (response.ok) {
    return { ok: true, status: response.status };
  }
  // Only read the body on failure, and only to explain the failure.
  const body = await response.text().catch(() => '');
  return { ok: false, status: response.status, body };
};

/** How much of the provider's error body to keep. Enough to read, not enough to be a dump. */
const MAX_ERROR_BODY = 300;

const ADDRESS_PATTERN = /[^\s"'<>@]+@[^\s"'<>@]+\.[^\s"'<>,;)}\]]+/g;
/** A run of hex long enough to be a secret rather than a coincidence (the reset token is 64). */
const SECRET_PATTERN = /[0-9a-f]{32,}/gi;

/**
 * SEC-0009, closing the residual that entry recorded: **the provider's error text is not
 * trusted.** An email API happily echoes the request back at you when it dislikes it —
 * `"Invalid `to` field: victim@example.com"` — and some echo the payload wholesale. Our
 * payload is the password-reset mail, whose text *is* the plaintext token. So the one thing
 * that makes a failure diagnosable (the provider's own words) is also the one thing that can
 * smuggle the secret into the log.
 *
 * Rather than choose between a useless log and a dangerous one, strip what we already know is
 * sensitive — our exact recipient and our exact body — then sweep for anything address-shaped
 * or secret-shaped the provider volunteered on its own. What survives is the part we actually
 * need: "the domain is not verified".
 *
 * Exported so the redaction is locked by a test rather than trusted to a reviewer's eye.
 */
export function redactProviderError(text: string, message: OutboundMessage): string {
  return text
    .split(message.body)
    .join('[body]')
    .split(message.to)
    .join('[address]')
    .replace(ADDRESS_PATTERN, '[address]')
    .replace(SECRET_PATTERN, '[redacted]');
}

/**
 * Build a {@link MessageSender} that POSTs a notification to an HTTP email
 * provider (a generic JSON `{ from, to, subject, text }` payload with a bearer
 * key). A non-2xx response throws — carrying the provider's own explanation — so the
 * caller logs a failure someone can act on. Only constructed when `EMAIL_*` is configured;
 * otherwise the email channel uses the inert logging sender.
 *
 * The payload shape is deliberately the lowest common denominator, and it matches Resend's
 * send API exactly (`POST https://api.resend.com/emails`), so that provider needs no adapter
 * of its own. See `docs/email-go-live.md`.
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
      const raw = response.body ?? '';
      const detail =
        raw === '' ? '' : `: ${redactProviderError(raw, message).slice(0, MAX_ERROR_BODY)}`;
      throw new Error(`Email provider responded ${String(response.status)}${detail}`);
    }
  };
}
