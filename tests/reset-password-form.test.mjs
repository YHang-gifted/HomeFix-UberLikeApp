import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateResetPasswordForm } from '../app/src/features/auth/resetPasswordForm.ts';

const valid = {
  token: 'reset-code-123',
  newPassword: 'long-enough-password',
  confirmPassword: 'long-enough-password',
};

describe('validateResetPasswordForm', () => {
  it('returns no errors for a valid form', () => {
    assert.deepEqual(validateResetPasswordForm(valid), {});
  });

  it('requires the reset code', () => {
    assert.ok(validateResetPasswordForm({ ...valid, token: '' }).token);
  });

  it('requires the new password to be at least 8 characters', () => {
    const errors = validateResetPasswordForm({
      ...valid,
      newPassword: 'short',
      confirmPassword: 'short',
    });
    assert.ok(errors.newPassword);
  });

  it('requires the confirmation to match', () => {
    assert.ok(
      validateResetPasswordForm({ ...valid, confirmPassword: 'different' }).confirmPassword,
    );
  });
});
