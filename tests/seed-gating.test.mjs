import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';
import { shouldSeedDemoUsers } from '../server/src/db/migrate.ts';

describe('shouldSeedDemoUsers', () => {
  it('seeds outside production by default', () => {
    assert.equal(
      shouldSeedDemoUsers({ NODE_ENV: 'development', SEED_DEMO_USERS: undefined }),
      true,
    );
    assert.equal(shouldSeedDemoUsers({ NODE_ENV: 'test', SEED_DEMO_USERS: undefined }), true);
  });

  it('does not seed in production by default', () => {
    assert.equal(
      shouldSeedDemoUsers({ NODE_ENV: 'production', SEED_DEMO_USERS: undefined }),
      false,
    );
  });

  it('an explicit flag overrides the default', () => {
    assert.equal(shouldSeedDemoUsers({ NODE_ENV: 'production', SEED_DEMO_USERS: true }), true);
    assert.equal(shouldSeedDemoUsers({ NODE_ENV: 'development', SEED_DEMO_USERS: false }), false);
  });
});

describe('SEED_DEMO_USERS env parsing', () => {
  it('is undefined when unset', () => {
    assert.equal(loadEnv({}).SEED_DEMO_USERS, undefined);
  });

  it('parses "true" / "false" to booleans', () => {
    assert.equal(loadEnv({ SEED_DEMO_USERS: 'true' }).SEED_DEMO_USERS, true);
    assert.equal(loadEnv({ SEED_DEMO_USERS: 'false' }).SEED_DEMO_USERS, false);
  });

  it('rejects a non-boolean value', () => {
    assert.throws(() => loadEnv({ SEED_DEMO_USERS: 'yes' }));
  });
});
