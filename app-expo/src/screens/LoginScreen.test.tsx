import { fireEvent, render } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { LoginScreen } from './LoginScreen';

// React Native Testing Library v14 (React 19) exposes an async API: `render`
// and `fireEvent` both return promises and must be awaited.
describe('LoginScreen', () => {
  it('shows validation errors and does not call the API on an empty submit', async () => {
    const login = jest.fn();
    const client = { login } as unknown as ApiClient;

    const { getByLabelText, findByText } = await render(<LoginScreen client={client} />);
    await fireEvent.press(getByLabelText('Sign in'));

    expect(await findByText('Enter a valid email')).toBeTruthy();
    expect(await findByText('Password is required')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('calls onSuccess with the token after a successful login', async () => {
    const login = jest.fn().mockResolvedValue('jwt-token');
    const client = { login } as unknown as ApiClient;
    const onSuccess = jest.fn();

    const { getByLabelText, findByText } = await render(
      <LoginScreen client={client} onSuccess={onSuccess} />,
    );
    await fireEvent.changeText(getByLabelText('Email'), 'customer@homefix.test');
    await fireEvent.changeText(getByLabelText('Password'), 'secret123');
    await fireEvent.press(getByLabelText('Sign in'));

    await findByText('Signed in');
    expect(login).toHaveBeenCalledWith('customer@homefix.test', 'secret123');
    expect(onSuccess).toHaveBeenCalledWith('jwt-token');
  });
});
