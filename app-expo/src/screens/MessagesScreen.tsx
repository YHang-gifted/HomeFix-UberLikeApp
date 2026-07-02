import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ConnectMessageStream } from '../../../app/src/features/messages/messageStream';
import { mergeIncomingMessage } from '../../../app/src/features/messages/messageStream';
import type { Message } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface MessagesScreenProps {
  /** The request whose thread to show. */
  requestId: string;
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
  /**
   * How often (ms) to re-fetch the thread while the screen is open, so new
   * messages appear without manual refresh. 0 disables polling (used by tests).
   */
  pollIntervalMs?: number;
  /**
   * Live message stream (a WebSocket). When provided, new messages are pushed in
   * real time and the poll interval is skipped (the socket handles liveness);
   * when absent, the screen falls back to polling. Injected for tests/web.
   */
  connectStream?: ConnectMessageStream;
}

export function MessagesScreen({
  requestId,
  client,
  refreshToken,
  pollIntervalMs = 5000,
  connectStream,
}: MessagesScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);
  const principal = useMemo(() => activeClient.getPrincipal(), [activeClient]);

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.listMessages(requestId);
        if (active) {
          setMessages(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load the conversation.');
        }
      }
    }

    void load();

    // Prefer a live WebSocket push when one is available: each pushed message is
    // merged into the thread in real time, and we skip polling entirely.
    if (connectStream !== undefined) {
      const subscription = connectStream(requestId, (incoming) => {
        if (active) {
          setMessages((current) => mergeIncomingMessage(current, incoming));
        }
      });
      return () => {
        active = false;
        subscription.close();
      };
    }

    // Fallback: poll while the thread is open so new messages arrive without a
    // manual refresh. Each tick re-fetches; the FlatList is keyed by id, so
    // unchanged messages don't flicker.
    const interval =
      pollIntervalMs > 0
        ? setInterval(() => {
            void load();
          }, pollIntervalMs)
        : undefined;
    return () => {
      active = false;
      if (interval !== undefined) {
        clearInterval(interval);
      }
    };
  }, [activeClient, requestId, refreshToken, reload, pollIntervalMs, connectStream]);

  async function send(): Promise<void> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return;
    }
    setSending(true);
    try {
      await activeClient.postMessage(requestId, trimmed);
      setBody('');
      setReload((current) => current + 1);
    } catch {
      setError('Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.root}>
      {error !== null && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      )}

      {messages === null ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No messages yet. Say hello!</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const mine = principal !== null && principal.id === item.senderId;
            return (
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={styles.sender}>{item.senderRole}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
              </View>
            );
          }}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder="Type a message"
          accessibilityLabel="Message"
          editable={!sending}
          multiline
        />
        <Pressable
          style={({ pressed }) => [
            styles.send,
            (pressed || sending || body.trim().length === 0) && styles.sendDisabled,
          ]}
          onPress={() => {
            void send();
          }}
          disabled={sending || body.trim().length === 0}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          {sending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  banner: { backgroundColor: '#fef2f2', padding: 12 },
  bannerText: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  bubble: { maxWidth: '80%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#dbeafe' },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9' },
  sender: { fontSize: 11, color: '#64748b', textTransform: 'capitalize', marginBottom: 2 },
  body: { fontSize: 15, color: '#0f172a' },
  time: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#0f172a',
    maxHeight: 120,
  },
  send: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 64,
  },
  sendDisabled: { backgroundColor: '#93c5fd' },
  sendText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
