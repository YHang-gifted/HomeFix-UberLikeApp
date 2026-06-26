import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { PublicUser } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface FavoritesScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function FavoritesScreen({ client, refreshToken }: FavoritesScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [favorites, setFavorites] = useState<PublicUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.listFavorites();
        if (active) {
          setFavorites(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your favorite workers.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken, reload]);

  async function remove(workerId: string): Promise<void> {
    setRemovingId(workerId);
    try {
      await activeClient.removeFavorite(workerId);
      setReload((current) => current + 1);
    } catch {
      // Ignore; the next reload will reflect the true state.
    } finally {
      setRemovingId(null);
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (favorites === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (favorites.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>You have not favorited any workers yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={favorites}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.name}>{item.displayName}</Text>
          <Pressable
            onPress={() => {
              void remove(item.id);
            }}
            disabled={removingId === item.id}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.displayName} from favorites`}
          >
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  name: { fontSize: 16, color: '#0f172a' },
  remove: { fontSize: 14, color: '#dc2626', fontWeight: '600' },
});
