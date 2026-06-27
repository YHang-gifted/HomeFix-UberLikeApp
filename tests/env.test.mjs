import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';

describe('loadEnv', () => {
  it('applies defaults for an empty environment', () => {
    const env = loadEnv({});
    assert.equal(env.NODE_ENV, 'development');
    assert.equal(env.PORT, 3000);
  });

  it('coerces PORT from a string', () => {
    const env = loadEnv({ PORT: '8080' });
    assert.equal(env.PORT, 8080);
  });

  it('throws on an invalid PORT', () => {
    assert.throws(() => loadEnv({ PORT: 'not-a-number' }));
  });

  it('allows the dev default JWT secret outside production', () => {
    assert.doesNotThrow(() => loadEnv({ NODE_ENV: 'development' }));
    assert.doesNotThrow(() => loadEnv({ NODE_ENV: 'test' }));
  });

  it('refuses to boot in production with the default JWT secret', () => {
    assert.throws(() => loadEnv({ NODE_ENV: 'production' }), /JWT_SECRET/);
    assert.throws(
      () => loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'dev-insecure-secret-change-me-please' }),
      /JWT_SECRET/,
    );
  });

  it('accepts a strong JWT secret in production', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-sufficiently-long-production-secret',
    });
    assert.equal(env.NODE_ENV, 'production');
  });

  it('defaults NOTIFY_CHANNELS to an empty list', () => {
    assert.deepEqual(loadEnv({}).NOTIFY_CHANNELS, []);
  });

  it('parses NOTIFY_CHANNELS as a trimmed, comma-separated list', () => {
    assert.deepEqual(loadEnv({ NOTIFY_CHANNELS: 'email, push' }).NOTIFY_CHANNELS, [
      'email',
      'push',
    ]);
  });
});
