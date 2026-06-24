import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { Notification, NotificationList } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface NotificationsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function NotificationsScreen({
  client,
  refreshToken,
}: NotificationsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [list, setList] = useState<NotificationList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.listNotifications();
        if (active) {
          setList(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your notifications.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken, reload]);

  async function markRead(notification: Notification): Promise<void> {
    if (notification.read) {
      return;
    }
    try {
      await activeClient.markNotificationRead(notification.id);
      setReload((current) => current + 1);
    } catch {
      // Ignore; the next reload will reflect the true state.
    }
  }

  async function markAll(): Promise<void> {
    try {
      await activeClient.markAllNotificationsRead();
      setReload((current) => current + 1);
    } catch {
      // Ignore; the next reload will reflect the true state.
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (list === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (list.items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>No notifications yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={list.items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.unread}>Unread: {String(list.unreadCount)}</Text>
          {list.unreadCount > 0 && (
            <Pressable
              onPress={() => {
                void markAll();
              }}
              accessibilityRole="button"
              accessibilityLabel="Mark all read"
            >
              <Text style={styles.markAll}>Mark all read</Text>
            </Pressable>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={[styles.row, !item.read && styles.rowUnread]}
          onPress={() => {
            void markRead(item);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Notification: ${item.message}`}
        >
          <Text style={[styles.message, !item.read && styles.messageUnread]}>{item.message}</Text>
          <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  unread: { fontSize: 13, fontWeight: '600', color: '#64748b', padding: 16 },
  markAll: { fontSize: 13, fontWeight: '600', color: '#2563eb', padding: 16 },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowUnread: { backgroundColor: '#eff6ff' },
  message: { fontSize: 15, color: '#334155' },
  messageUnread: { color: '#0f172a', fontWeight: '600' },
  time: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
});
