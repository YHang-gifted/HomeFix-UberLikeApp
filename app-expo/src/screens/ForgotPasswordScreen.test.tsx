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
});
