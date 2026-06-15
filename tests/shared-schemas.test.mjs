import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  coordinatesSchema,
  createServiceRequestInputSchema,
  userSchema,
} from '../shared/schemas.ts';

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('coordinatesSchema', () => {
  it('accepts valid coordinates', () => {
    assert.equal(coordinatesSchema.safeParse({ latitude: 25.03, longitude: 121.56 }).success, true);
  });

  it('rejects out-of-range latitude', () => {
    assert.equal(coordinatesSchema.safeParse({ latitude: 999, longitude: 0 }).success, false);
  });
});

describe('userSchema', () => {
  it('rejects an invalid email', () => {
    const result = userSchema.safeParse({
      id: VALID_UUID,
      role: 'customer',
      email: 'not-an-email',
      displayName: 'Ada',
      createdAt: new Date().toISOString(),
    });
    assert.equal(result.success, false);
  });
});

describe('createServiceRequestInputSchema', () => {
  it('accepts a well-formed request', () => {
    const result = createServiceRequestInputSchema.safeParse({
      customerId: VALID_UUID,
      category: 'plumbing',
      description: 'Leaking kitchen sink',
      location: { latitude: 25.03, longitude: 121.56 },
    });
    assert.equal(result.success, true);
  });

  it('rejects an unknown category', () => {
    const result = createServiceRequestInputSchema.safeParse({
      customerId: VALID_UUID,
      category: 'teleportation',
      description: 'x',
      location: { latitude: 0, longitude: 0 },
    });
    assert.equal(result.success, false);
  });
});
