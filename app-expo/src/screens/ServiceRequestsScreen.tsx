import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface ServiceRequestsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
}

export function ServiceRequestsScreen({ client }: ServiceRequestsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

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
  }, [activeClient]);

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (items === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>You have no service requests yet.</Text>
      </View>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  list: { flex: 1, backgroundColor: '#ffffff' },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  category: { fontSize: 15, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  status: { fontSize: 13, color: '#2563eb', textTransform: 'capitalize' },
  description: { fontSize: 14, color: '#334155' },
});
