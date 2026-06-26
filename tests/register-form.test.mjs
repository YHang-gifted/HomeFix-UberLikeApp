import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateRegisterForm } from '../app/src/features/auth/registerForm.ts';

describe('validateRegisterForm', () => {
  it('accepts a valid form', () => {
    const errors = validateRegisterForm({
      email: 'a@b.co',
      password: 'sup3rsecret',
      displayName: 'Jo',
    });
    assert.deepEqual(errors, {});
  });

  it('flags a bad email', () => {
    const errors = validateRegisterForm({
      email: 'nope',
      password: 'sup3rsecret',
      displayName: 'Jo',
    });
    assert.equal(errors.email, 'Enter a valid email');
  });

  it('flags a short password', () => {
    const errors = validateRegisterForm({ email: 'a@b.co', password: 'short', displayName: 'Jo' });
    assert.equal(errors.password, 'Password must be at least 8 characters');
  });

  it('flags a missing name', () => {
    const errors = validateRegisterForm({
      email: 'a@b.co',
      password: 'sup3rsecret',
      displayName: '   ',
    });
    assert.equal(errors.displayName, 'Name is required');
  });
});
