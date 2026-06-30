import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Message, Principal } from '../../../shared/schemas';
import { MessagesScreen } from './MessagesScreen';

const REQUEST_ID = '523e4567-e89b-12d3-a456-426614174000';
const CUSTOMER_ID = '123e4567-e89b-12d3-a456-426614174000';
const WORKER_ID = '423e4567-e89b-12d3-a456-426614174000';
const CUSTOMER: Principal = { id: CUSTOMER_ID, role: 'customer' };

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: '623e4567-e89b-12d3-a456-426614174000',
    requestId: REQUEST_ID,
    senderId: WORKER_ID,
    senderRole: 'worker',
    body: 'On my way',
    createdAt: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

function clientWith(extra: Record<string, unknown>, principal: Principal = CUSTOMER) {
  return { getPrincipal: jest.fn().mockReturnValue(principal), ...extra } as unknown as ApiClient;
}

describe('MessagesScreen', () => {
  it('renders the conversation thread', async () => {
    const client = clientWith({
      listMessages: jest.fn().mockResolvedValue([makeMessage()]),
    });

    const { findByText } = await render(<MessagesScreen requestId={REQUEST_ID} client={client} />);

    await findByText('On my way');
  });

  it('shows an empty state when there are no messages', async () => {
    const client = clientWith({ listMessages: jest.fn().mockResolvedValue([]) });

    const { findByText } = await render(<MessagesScreen requestId={REQUEST_ID} client={client} />);

    await findByText('No messages yet. Say hello!');
  });

  it('re-fetches the thread on the poll interval', async () => {
    const listMessages = jest.fn().mockResolvedValue([makeMessage()]);
    const client = clientWith({ listMessages });

    await render(<MessagesScreen requestId={REQUEST_ID} client={client} pollIntervalMs={30} />);

    await waitFor(() => {
      expect(listMessages.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('does not poll when the interval is 0', async () => {
    const listMessages = jest.fn().mockResolvedValue([makeMessage()]);
    const client = clientWith({ listMessages });

    const { findByText } = await render(
      <MessagesScreen requestId={REQUEST_ID} client={client} pollIntervalMs={0} />,
    );
    await findByText('On my way');

    expect(listMessages).toHaveBeenCalledTimes(1);
  });

  it('sends a message and reloads the thread', async () => {
    const listMessages = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        makeMessage({ id: 'm2', senderId: CUSTOMER_ID, senderRole: 'customer', body: 'Hello!' }),
      ]);
    const postMessage = jest.fn().mockResolvedValue(makeMessage({ id: 'm2', body: 'Hello!' }));
    const client = clientWith({ listMessages, postMessage });

    const { findByText, getByLabelText } = await render(
      <MessagesScreen requestId={REQUEST_ID} client={client} />,
    );
    await findByText('No messages yet. Say hello!');

    await fireEvent.changeText(getByLabelText('Message'), '  Hello!  ');
    await fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(REQUEST_ID, 'Hello!');
    });
    await findByText('Hello!');
  });
});
