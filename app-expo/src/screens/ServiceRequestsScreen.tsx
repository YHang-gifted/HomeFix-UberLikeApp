import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface ServiceRequestsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called when the user taps "New request". */
  onNewRequest?: () => void;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function ServiceRequestsScreen({
  client,
  onNewRequest,
  refreshToken,
}: ServiceRequestsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(null);

    async function load(): Promise<void> {
      try {
        const page = await activeClient.listServiceRequests();
        if (active) {
          setItems(page.items);
        }
      } catch {
        if (active) {
          setError('Could not load your requests.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  return (
    <View style={styles.root}>
      <Pressable
        style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
        onPress={() => {
          onNewRequest?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="New request"
      >
        <Text style={styles.newButtonText}>+ New request</Text>
      </Pressable>

      {error !== null && (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      {error === null && items === null && (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      )}

      {error === null && items !== null && items.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.empty}>You have no service requests yet.</Text>
        </View>
      )}

      {error === null && items !== null && items.length > 0 && (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.status}>{item.status}</Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  newButton: {
    margin: 16,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  newButtonPressed: { backgroundColor: '#1d4ed8' },
  newButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  list: { flex: 1 },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  category: { fontSize: 15, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  status: { fontSize: 13, color: '#2563eb', textTransform: 'capitalize' },
  description: { fontSize: 14, color: '#334155' },
});
