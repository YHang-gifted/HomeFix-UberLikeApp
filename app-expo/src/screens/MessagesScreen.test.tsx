import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ConnectMessageStream } from '../../../app/src/features/messages/messageStream';
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

  it('pushes live messages from the stream and skips polling', async () => {
    const listMessages = jest.fn().mockResolvedValue([makeMessage()]);
    const client = clientWith({ listMessages });
    let push: ((message: Message) => void) | undefined;
    const close = jest.fn();
    const connectStream = jest.fn((_requestId: string, onMessage: (message: Message) => void) => {
      push = onMessage;
      return { close };
    });

    const { findByText } = await render(
      <MessagesScreen
        requestId={REQUEST_ID}
        client={client}
        pollIntervalMs={30}
        connectStream={connectStream as unknown as ConnectMessageStream}
      />,
    );
    await findByText('On my way');

    await act(async () => {
      push?.(makeMessage({ id: 'live1', body: 'Live!' }));
    });
    await findByText('Live!');

    // The socket handles liveness, so we never poll beyond the initial load.
    expect(listMessages).toHaveBeenCalledTimes(1);
  });

  it('opens a live stream for the request instead of polling', async () => {
    const listMessages = jest.fn().mockResolvedValue([]);
    const client = clientWith({ listMessages });
    const close = jest.fn();
    const connectStream = jest.fn(() => ({ close }));

    const { findByText } = await render(
      <MessagesScreen
        requestId={REQUEST_ID}
        client={client}
        pollIntervalMs={30}
        connectStream={connectStream as unknown as ConnectMessageStream}
      />,
    );
    await findByText('No messages yet. Say hello!');

    expect(connectStream).toHaveBeenCalledWith(REQUEST_ID, expect.any(Function));
    // The socket handles liveness, so the poll interval never fires.
    expect(listMessages).toHaveBeenCalledTimes(1);
  });
});
