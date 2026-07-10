import process from 'node:process';

import { z } from 'zod';

import { DEFAULT_PLATFORM_FEE_BPS } from '../../../shared/schemas.ts';

/**
 * The dev-only fallback JWT secret. Safe for local development, but it is in the
 * public source tree, so any token signed with it is forgeable. Production must
 * override `JWT_SECRET`; `loadEnv` refuses to boot in production otherwise
 * (SEC-0004).
 */
export const DEV_JWT_SECRET = 'dev-insecure-secret-change-me-please';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    // Bearer token guarding the Prometheus /metrics endpoint. Set it and scrapers
    // must send `Authorization: Bearer <token>`; leave it unset and /metrics is open
    // (dev / trusted network only — set it, or restrict at the proxy, in production).
    // Empty is treated as unset.
    METRICS_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // Log output format. `json` (the default) writes one self-contained JSON object
    // per line so a log drain can index the fields; `pretty` writes a compact human
    // line for local dev. Empty is treated as unset (→ json). Validated here so a
    // bad value fails fast on boot; the logger reads the raw env var itself.
    LOG_FORMAT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['json', 'pretty']).default('json'),
    ),
    JWT_SECRET: z.string().min(16).default(DEV_JWT_SECRET),
    JWT_EXPIRES_IN: z.coerce.number().int().positive().default(604800),
    // Comma-separated allowlist of web origins permitted to call the API from a
    // browser. Empty (the default) keeps the permissive dev behavior (`*`);
    // production should set this to the known web origin(s). See SEC-0002.
    CORS_ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    // Comma-separated notification delivery channels to enable (e.g. "email,push").
    // Empty (the default) sends to no external channel, so nothing is delivered by
    // accident before real providers are configured. Unknown names are ignored.
    NOTIFY_CHANNELS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((channel) => channel.trim())
          .filter((channel) => channel.length > 0),
      ),
    // Whether to seed the demo users on boot. Unset (the default) seeds outside
    // production but not in production, so a real deploy doesn't create demo
    // accounts; set explicitly to override either way.
    SEED_DEMO_USERS: z
      .preprocess(
        (value) => (value === '' ? undefined : value),
        z.enum(['true', 'false']).optional(),
      )
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    // Email delivery provider. All three must be set for email to actually send;
    // otherwise the email channel falls back to the inert logging sender. Empty
    // values are treated as unset.
    EMAIL_API_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
    EMAIL_API_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    EMAIL_FROM: z.preprocess((value) => (value === '' ? undefined : value), z.email().optional()),
    // Push delivery endpoint (e.g. the Expo push API). Set it to actually send
    // push (with NOTIFY_CHANNELS including "push"); unset and the push channel
    // logs only. Empty is treated as unset.
    PUSH_API_URL: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
    // Platform commission on each payment, in basis points (1500 = 15%). Applied
    // when a payment is created to split the gross into the platform's cut and the
    // worker's net (Model B marketplace split).
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(DEFAULT_PLATFORM_FEE_BPS),
    // Secret used to verify a provider's webhook HMAC signature: the request's
    // `x-webhook-signature` must equal hmac_sha256(secret, rawBody) for the
    // payment/payout webhooks. Unset outside production lets the mock provider
    // confirm without a signature; in production an unset secret rejects every
    // webhook, so nothing can be confirmed by accident. Empty is treated as unset.
    PAYMENTS_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // Object storage for uploaded images. Set the bucket, region, and credentials
    // to store images in real S3 (the app returns a presigned PUT URL the client
    // uploads to directly); leave any unset and uploads fall back to the in-memory
    // mock store (dev/test). Empty values are treated as unset.
    STORAGE_S3_BUCKET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    STORAGE_S3_REGION: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    STORAGE_S3_ACCESS_KEY_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    STORAGE_S3_SECRET_ACCESS_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // Public base URL images are read from (a CDN or the bucket's public URL). If
    // unset, the bucket's virtual-hosted S3 URL is used.
    STORAGE_S3_PUBLIC_BASE_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    // Optional custom endpoint for S3-compatible storage (R2, MinIO, …).
    STORAGE_S3_ENDPOINT: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    // Presigned upload URL lifetime in seconds (default 900 = 15 min, max 1 hour).
    STORAGE_S3_UPLOAD_EXPIRES_SECONDS: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.coerce.number().int().positive().max(3600).default(900),
    ),
    // Stripe secret key. Set it to take real payments via Stripe (createCharge opens
    // a PaymentIntent); leave unset and the inert mock provider is used (dev/test).
    // Supplied by the operator — never committed. Empty is treated as unset.
    STRIPE_SECRET_KEY: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // Where Stripe returns the customer after hosted checkout. Both are required
    // when STRIPE_SECRET_KEY is set (point them at the app, e.g. its public URL
    // with a `?payment=success`/`?payment=cancelled` marker). Empty = unset.
    STRIPE_CHECKOUT_SUCCESS_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    STRIPE_CHECKOUT_CANCEL_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    // Stripe webhook signing secret (`whsec_…`). Set it (with STRIPE_SECRET_KEY) to
    // accept Stripe's `/webhooks/stripe` callbacks — the request's `Stripe-Signature`
    // is verified against it, and a `checkout.session.completed` event settles the
    // matching payment. Unset and the Stripe webhook endpoint is disabled (404).
    // Supplied by the operator — never committed. Empty is treated as unset.
    STRIPE_WEBHOOK_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // PayPal REST credentials. Set BOTH to offer PayPal (and Venmo) as a checkout
    // method alongside Stripe; leave unset and PayPal is simply unavailable (the mock
    // provider still handles the `card` method). Operator-supplied — never committed.
    PAYPAL_CLIENT_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    PAYPAL_CLIENT_SECRET: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // Where PayPal returns the customer after they approve / cancel the order (point
    // them at the app, like the Stripe return URLs). Required when PAYPAL_CLIENT_ID is
    // set. Empty = unset.
    PAYPAL_RETURN_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    PAYPAL_CANCEL_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    // Which PayPal environment the credentials belong to. `sandbox` (default) targets
    // api-m.sandbox.paypal.com; `live` targets api-m.paypal.com.
    PAYPAL_ENV: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['sandbox', 'live']).default('sandbox'),
    ),
    // Where Stripe Connect returns the worker after (or during) onboarding. Both are
    // required to enable worker payout onboarding (with STRIPE_SECRET_KEY); point them at
    // the app. `return_url` = onboarding finished; `refresh_url` = the link expired and a
    // fresh one is needed. Empty = unset.
    STRIPE_CONNECT_RETURN_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    STRIPE_CONNECT_REFRESH_URL: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.url().optional(),
    ),
    // PayPal webhook id (from the dashboard webhook you create). Set it (with the client
    // credentials) to accept `POST /webhooks/paypal` — each delivery is verified against
    // PayPal's verify-webhook-signature API. Unset and the endpoint is disabled (404), so
    // no payment can be settled out-of-band before you are ready. Empty = unset.
    PAYPAL_WEBHOOK_ID: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    // Absolute path to the built web bundle (the Expo web export, `app-expo/dist`).
    // Set it to serve the web app same-origin with the API (static assets + an SPA
    // fallback); leave unset (dev/test) and only the API is served. Empty = unset.
    WEB_DIST_DIR: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be set to a strong, non-default value in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}
