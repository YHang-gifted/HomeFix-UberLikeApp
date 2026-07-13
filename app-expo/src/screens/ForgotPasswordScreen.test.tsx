import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';

describe('ForgotPasswordScreen', () => {
  it('requests a reset code and then resets the password', async () => {
    const forgotPassword = jest.fn().mockResolvedValue(undefined);
    const resetPassword = jest.fn().mockResolvedValue(undefined);
    const client = { forgotPassword, resetPassword } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ForgotPasswordScreen client={client} />);

    await fireEvent.changeText(getByLabelText('Email'), 'me@homefix.test');
    await fireEvent.press(getByLabelText('Send reset code'));

    await findByText(/we sent a reset code/i);
    expect(forgotPassword).toHaveBeenCalledWith('me@homefix.test');

    await fireEvent.changeText(getByLabelText('Reset code'), 'code-123');
    await fireEvent.changeText(getByLabelText('New password'), 'brand-new-pass');
    await fireEvent.changeText(getByLabelText('Confirm new password'), 'brand-new-pass');
    await fireEvent.press(getByLabelText('Reset password'));

    await findByText(/password has been reset/i);
    expect(resetPassword).toHaveBeenCalledWith('code-123', 'brand-new-pass');
  });

  it('blocks the reset when the passwords do not match', async () => {
    const forgotPassword = jest.fn().mockResolvedValue(undefined);
    const resetPassword = jest.fn();
    const client = { forgotPassword, resetPassword } as unknown as ApiClient;

    const { findByText, getByLabelText } = await render(<ForgotPasswordScreen client={client} />);

    await fireEvent.changeText(getByLabelText('Email'), 'me@homefix.test');
    await fireEvent.press(getByLabelText('Send reset code'));
    await findByText(/we sent a reset code/i);

    await fireEvent.changeText(getByLabelText('Reset code'), 'code-123');
    await fireEvent.changeText(getByLabelText('New password'), 'brand-new-pass');
    await fireEvent.changeText(getByLabelText('Confirm new password'), 'different-pass');
    await fireEvent.press(getByLabelText('Reset password'));

    await findByText('Passwords do not match');
    expect(resetPassword).not.toHaveBeenCalled();
  });

  // slice 183: arriving from the emailed magic link. The whole point is that the user never
  // handles the 64-character code — so they must not be asked for their email again, nor shown
  // a code field to paste into.
  describe('arriving from the reset link', () => {
    const LINK_TOKEN = 'a'.repeat(64);

    it('goes straight to the new password, using the code from the link', async () => {
      const resetPassword = jest.fn().mockResolvedValue(undefined);
      const forgotPassword = jest.fn();
      const client = { forgotPassword, resetPassword } as unknown as ApiClient;

      const { findByText, getByLabelText, queryByLabelText } = await render(
        <ForgotPasswordScreen client={client} initialToken={LINK_TOKEN} />,
      );

      // No email step, and no code to copy — the link already carried both facts.
      expect(queryByLabelText('Email')).toBeNull();
      expect(queryByLabelText('Send reset code')).toBeNull();
      expect(queryByLabelText('Reset code')).toBeNull();

      await fireEvent.changeText(getByLabelText('New password'), 'brand-new-pass');
      await fireEvent.changeText(getByLabelText('Confirm new password'), 'brand-new-pass');
      await fireEvent.press(getByLabelText('Reset password'));

      await findByText(/password has been reset/i);
      expect(resetPassword).toHaveBeenCalledWith(LINK_TOKEN, 'brand-new-pass');
      expect(forgotPassword).not.toHaveBeenCalled();
    });

    it('still asks for an email when there is no link token', async () => {
      const client = {
        forgotPassword: jest.fn(),
        resetPassword: jest.fn(),
      } as unknown as ApiClient;
      const { getByLabelText } = await render(<ForgotPasswordScreen client={client} />);
      expect(getByLabelText('Email')).toBeTruthy();
    });
  });
});
