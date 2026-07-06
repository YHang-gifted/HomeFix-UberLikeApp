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
import { colors, radii, spacing } from '../theme';

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
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 15, textAlign: 'center' },
  banner: { backgroundColor: colors.dangerSoft, padding: spacing.md },
  bannerText: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  list: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' },
  listContent: { padding: spacing.lg, gap: spacing.sm },
  bubble: {
    maxWidth: '80%',
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.line,
  },
  sender: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkMuted,
    textTransform: 'capitalize',
    marginBottom: 2,
  },
  body: { fontSize: 15, color: colors.ink },
  time: { fontSize: 11, color: colors.inkMuted, marginTop: spacing.xs },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.canvas,
    maxHeight: 120,
  },
  send: {
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 64,
  },
  sendDisabled: { backgroundColor: colors.surfaceMuted },
  sendText: { color: colors.white, fontSize: 15, fontWeight: '700' },
});
