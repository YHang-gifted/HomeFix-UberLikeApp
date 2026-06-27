import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { loadEnv } from '../server/src/config/env.ts';

/** Parse the uncommented `KEY=VALUE` lines of an .env file into an object. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const examplePath = fileURLToPath(new URL('../.env.example', import.meta.url));
const example = parseEnv(readFileSync(examplePath, 'utf8'));

describe('.env.example', () => {
  it('documents the active variables the schema reads', () => {
    for (const key of ['NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN']) {
      assert.ok(key in example, `missing ${key}`);
    }
    assert.ok('CORS_ALLOWED_ORIGINS' in example, 'missing CORS_ALLOWED_ORIGINS');
  });

  it('loads cleanly through loadEnv (stays valid against the schema)', () => {
    const env = loadEnv(example);
    assert.equal(env.NODE_ENV, 'development');
    assert.equal(env.PORT, 3000);
    assert.equal(env.JWT_EXPIRES_IN, 604800);
    // Empty CORS list parses to an empty allowlist (permissive dev default).
    assert.deepEqual(env.CORS_ALLOWED_ORIGINS, []);
  });
});
