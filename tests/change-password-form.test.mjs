import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateChangePasswordForm } from '../app/src/features/auth/changePasswordForm.ts';

const valid = {
  currentPassword: 'old-password',
  newPassword: 'long-enough-password',
  confirmPassword: 'long-enough-password',
};

describe('validateChangePasswordForm', () => {
  it('returns no errors for a valid form', () => {
    assert.deepEqual(validateChangePasswordForm(valid), {});
  });

  it('requires the current password', () => {
    const errors = validateChangePasswordForm({ ...valid, currentPassword: '' });
    assert.ok(errors.currentPassword);
  });

  it('requires the new password to be at least 8 characters', () => {
    const errors = validateChangePasswordForm({
      ...valid,
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.ok(errors.newPassword);
  });

  it('requires the confirmation to match the new password', () => {
    const errors = validateChangePasswordForm({ ...valid, confirmPassword: 'different' });
    assert.ok(errors.confirmPassword);
  });
});
