import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { apiClient } from '../api';
import { colors } from '../theme';

export interface AlertsButtonProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called when the button is tapped (navigate to the notifications screen). */
  onPress?: () => void;
  /** Bump this to refetch the unread count (e.g. when the screen regains focus). */
  refreshToken?: number;
}

/**
 * Header button that opens the notifications screen and shows an unread-count
 * badge. The count is fetched best-effort; failures leave the badge hidden so a
 * notifications outage never blocks the surrounding screen.
 */
export function AlertsButton({ client, onPress, refreshToken }: AlertsButtonProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const list = await activeClient.listNotifications();
        if (active) {
          setUnreadCount(list.unreadCount);
        }
      } catch {
        // Unread count is secondary; ignore failures.
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  return (
    <Pressable
      style={styles.button}
      onPress={() => {
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        unreadCount > 0 ? `Notifications, ${String(unreadCount)} unread` : 'Notifications'
      }
    >
      <Text style={styles.text}>Alerts</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 },
  text: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  badge: {
    marginLeft: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
});
