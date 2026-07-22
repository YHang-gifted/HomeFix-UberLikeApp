import type { Env } from './env.ts';
import { logger } from '../utils/logger.ts';

/** One line of the boot-time provider report: a subsystem and its resolved configuration. */
export interface ProviderStatus {
  name: string;
  detail: string;
}

/** Given a list of `[VARNAME, value]`, the names whose value is unset. */
function unsetNames(checks: [string, string | undefined][]): string[] {
  return checks.filter(([, value]) => value === undefined).map(([name]) => name);
}

/**
 * Summarize which external providers are live vs. mock/inert, from the environment — so a glance at
 * the boot log answers "is Stripe live? is email actually sending?" instead of a registration, a
 * log hunt and a dashboard screenshot. Pure (no I/O), so it is unit-tested directly; the fields and
 * conditions mirror the config-gated selectors (`paymentProvider`, `connectService`, the notifier,
 * storage), so the report tracks what the app actually does.
 */
export function describeProviders(env: Env): ProviderStatus[] {
  const isSet = (value: string | undefined): boolean => value !== undefined;

  const connectUnset = unsetNames([
    ['STRIPE_SECRET_KEY', env.STRIPE_SECRET_KEY],
    ['STRIPE_CONNECT_RETURN_URL', env.STRIPE_CONNECT_RETURN_URL],
    ['STRIPE_CONNECT_REFRESH_URL', env.STRIPE_CONNECT_REFRESH_URL],
  ]);
  const emailUnset = unsetNames([
    ['EMAIL_API_URL', env.EMAIL_API_URL],
    ['EMAIL_API_KEY', env.EMAIL_API_KEY],
    ['EMAIL_FROM', env.EMAIL_FROM],
  ]);
  const storageUnset = unsetNames([
    ['STORAGE_S3_BUCKET', env.STORAGE_S3_BUCKET],
    ['STORAGE_S3_REGION', env.STORAGE_S3_REGION],
    ['STORAGE_S3_ACCESS_KEY_ID', env.STORAGE_S3_ACCESS_KEY_ID],
    ['STORAGE_S3_SECRET_ACCESS_KEY', env.STORAGE_S3_SECRET_ACCESS_KEY],
  ]);
  const paypalOn = isSet(env.PAYPAL_CLIENT_ID) && isSet(env.PAYPAL_CLIENT_SECRET);
  const pushOn = isSet(env.PUSH_API_URL);

  return [
    {
      name: 'payments',
      detail: isSet(env.STRIPE_SECRET_KEY)
        ? 'stripe (live keys)'
        : 'mock (STRIPE_SECRET_KEY unset)',
    },
    {
      name: 'stripe webhook',
      detail: isSet(env.STRIPE_WEBHOOK_SECRET)
        ? 'enabled'
        : 'disabled (STRIPE_WEBHOOK_SECRET unset)',
    },
    {
      name: 'payouts (connect)',
      detail:
        connectUnset.length === 0
          ? isSet(env.STRIPE_CONNECT_WEBHOOK_SECRET)
            ? 'live (webhook enabled)'
            : 'live (STRIPE_CONNECT_WEBHOOK_SECRET unset — account.updated ignored)'
          : `off (${connectUnset.join(', ')} unset)`,
    },
    {
      name: 'paypal',
      detail: paypalOn ? `on (${env.PAYPAL_ENV})` : 'off (PAYPAL_CLIENT_ID/SECRET unset)',
    },
    {
      name: 'email',
      detail: emailUnset.length === 0 ? 'live' : `inert (${emailUnset.join(', ')} unset)`,
    },
    {
      name: 'push',
      detail: !pushOn
        ? 'off (PUSH_API_URL unset)'
        : env.NOTIFY_CHANNELS.includes('push')
          ? 'live'
          : 'configured, channel off (add "push" to NOTIFY_CHANNELS)',
    },
    {
      name: 'storage',
      detail: storageUnset.length === 0 ? 's3' : 'in-memory mock (S3 vars unset)',
    },
    {
      name: 'metrics',
      detail: isSet(env.METRICS_TOKEN) ? 'protected' : 'OPEN (METRICS_TOKEN unset)',
    },
  ];
}

/** Log the provider report at boot, one line per subsystem. */
export function logProviderReport(env: Env): void {
  logger.info('Provider configuration at boot:');
  for (const { name, detail } of describeProviders(env)) {
    logger.info(`  ${name}: ${detail}`);
  }
}
