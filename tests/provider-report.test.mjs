import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';
import { describeProviders } from '../server/src/config/providerReport.ts';

// The boot-time provider report says which externals are live vs. mock/inert, so "is Stripe live?
// is email sending?" is answered by a glance at the log instead of a registration + a log hunt.

function detailOf(env, name) {
  const row = describeProviders(env).find((r) => r.name === name);
  assert.ok(row, `expected a report row for "${name}"`);
  return row.detail;
}

describe('describeProviders', () => {
  it('reports everything mock/inert/off for an empty environment', () => {
    const env = loadEnv({});
    assert.match(detailOf(env, 'payments'), /mock/i);
    assert.match(detailOf(env, 'stripe webhook'), /disabled/i);
    assert.match(detailOf(env, 'payouts (connect)'), /off/i);
    assert.match(detailOf(env, 'paypal'), /off/i);
    assert.match(detailOf(env, 'email'), /inert/i);
    assert.match(detailOf(env, 'push'), /off/i);
    assert.match(detailOf(env, 'storage'), /in-memory mock/i);
    assert.match(detailOf(env, 'metrics'), /open/i);
  });

  it('names the specific unset variables so the gap is obvious', () => {
    const env = loadEnv({ EMAIL_API_URL: 'https://mail.example/send', EMAIL_API_KEY: 'k' });
    // Two of three set → the report calls out the one that is missing.
    assert.match(detailOf(env, 'email'), /inert \(EMAIL_FROM unset\)/);
  });

  it('reports live providers when configured', () => {
    const env = loadEnv({
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: 'whsec_x',
      STRIPE_CONNECT_RETURN_URL: 'https://app.example/connect/return',
      STRIPE_CONNECT_REFRESH_URL: 'https://app.example/connect/refresh',
      STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
      PAYPAL_CLIENT_ID: 'id',
      PAYPAL_CLIENT_SECRET: 'secret',
      PAYPAL_ENV: 'live',
      EMAIL_API_URL: 'https://mail.example/send',
      EMAIL_API_KEY: 'k',
      EMAIL_FROM: 'HomeFix <noreply@homefix.example>',
      PUSH_API_URL: 'https://push.example/send',
      NOTIFY_CHANNELS: 'email,push',
      STORAGE_S3_BUCKET: 'bucket',
      STORAGE_S3_REGION: 'us-east-1',
      STORAGE_S3_ACCESS_KEY_ID: 'AKIA',
      STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
      METRICS_TOKEN: 'metrics-token',
    });

    assert.match(detailOf(env, 'payments'), /stripe/i);
    assert.match(detailOf(env, 'stripe webhook'), /enabled/i);
    assert.match(detailOf(env, 'payouts (connect)'), /^live/i);
    assert.match(detailOf(env, 'paypal'), /on \(live\)/);
    assert.match(detailOf(env, 'email'), /^live/i);
    assert.match(detailOf(env, 'push'), /^live/i);
    assert.match(detailOf(env, 'storage'), /s3/i);
    assert.match(detailOf(env, 'metrics'), /protected/i);
  });

  it('flags push configured but with its channel disabled', () => {
    const env = loadEnv({ PUSH_API_URL: 'https://push.example/send' });
    assert.match(detailOf(env, 'push'), /channel off/i);
  });

  it('flags connect live but with the account.updated webhook secret unset', () => {
    const env = loadEnv({
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_CONNECT_RETURN_URL: 'https://app.example/connect/return',
      STRIPE_CONNECT_REFRESH_URL: 'https://app.example/connect/refresh',
    });
    assert.match(detailOf(env, 'payouts (connect)'), /live .*STRIPE_CONNECT_WEBHOOK_SECRET unset/i);
  });
});
