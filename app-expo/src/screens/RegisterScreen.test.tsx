import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiError, type ApiClient } from '../../../app/src/services/apiClient';
import { RegisterScreen } from './RegisterScreen';

function clientWith(extra: Record<string, unknown>) {
  return extra as unknown as ApiClient;
}

describe('RegisterScreen', () => {
  it('validates the form before calling the API', async () => {
    const register = jest.fn();
    const client = clientWith({ register });

    const { getByLabelText, findByText } = await render(<RegisterScreen client={client} />);
    await fireEvent.press(getByLabelText('Create account'));

    await findByText('Enter a valid email');
    expect(register).not.toHaveBeenCalled();
  });

  it('registers a customer and reports success', async () => {
    const register = jest.fn().mockResolvedValue('tok-123');
    const client = clientWith({ register });
    const onSuccess = jest.fn();

    const { getByLabelText } = await render(
      <RegisterScreen client={client} onSuccess={onSuccess} />,
    );
    await fireEvent.changeText(getByLabelText('Name'), 'Jo Tester');
    await fireEvent.changeText(getByLabelText('Email'), 'jo@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'sup3rsecret');
    await fireEvent.press(getByLabelText('Create account'));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: 'jo@example.com',
        password: 'sup3rsecret',
        displayName: 'Jo Tester',
        role: 'customer',
      });
    });
    expect(onSuccess).toHaveBeenCalledWith('tok-123');
  });

  it('registers as a worker when that role is selected', async () => {
    const register = jest.fn().mockResolvedValue('tok-w');
    const client = clientWith({ register });

    const { getByLabelText } = await render(<RegisterScreen client={client} />);
    await fireEvent.changeText(getByLabelText('Name'), 'Wendy Worker');
    await fireEvent.changeText(getByLabelText('Email'), 'wendy@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'sup3rsecret');
    await fireEvent.press(getByLabelText('I do repairs'));
    await fireEvent.press(getByLabelText('Create account'));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'worker', email: 'wendy@example.com' }),
      );
    });
  });

  it('shows a message when the email is already taken', async () => {
    const register = jest.fn().mockRejectedValue(new ApiError(409, 'dup'));
    const client = clientWith({ register });

    const { getByLabelText, findByText } = await render(<RegisterScreen client={client} />);
    await fireEvent.changeText(getByLabelText('Name'), 'Jo');
    await fireEvent.changeText(getByLabelText('Email'), 'taken@example.com');
    await fireEvent.changeText(getByLabelText('Password'), 'sup3rsecret');
    await fireEvent.press(getByLabelText('Create account'));

    await findByText('An account with this email already exists.');
  });
});
