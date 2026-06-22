import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getPrincipalFromToken } from '../app/src/auth/token.ts';
import { ApiClient } from '../app/src/services/apiClient.ts';
import { signToken } from '../server/src/auth/jwt.ts';

const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('getPrincipalFromToken', () => {
  it('decodes the principal from a signed token', () => {
    const token = signToken({ id: CUSTOMER_ID, role: 'customer' });
    const principal = getPrincipalFromToken(token);
    assert.deepEqual(principal, { id: CUSTOMER_ID, role: 'customer' });
  });

  it('returns null for a malformed token', () => {
    assert.equal(getPrincipalFromToken('not-a-jwt'), null);
    assert.equal(getPrincipalFromToken('a.b.c'), null);
  });
});

describe('ApiClient.getPrincipal', () => {
  it('returns null before a token is set', () => {
    const client = new ApiClient('http://example.test');
    assert.equal(client.getPrincipal(), null);
  });

  it('returns the decoded principal once a token is set', () => {
    const client = new ApiClient('http://example.test');
    client.setToken(signToken({ id: CUSTOMER_ID, role: 'customer' }));
    assert.deepEqual(client.getPrincipal(), { id: CUSTOMER_ID, role: 'customer' });
  });
});
