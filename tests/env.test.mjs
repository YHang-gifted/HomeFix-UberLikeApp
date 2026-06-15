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
});
