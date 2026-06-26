import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest } from '../../../shared/schemas';
import { useCustomerNames } from '../hooks/useCustomerNames';
import { apiClient } from '../api';

export interface AvailableJobsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called with the request id when a card is tapped. */
  onSelectRequest?: (id: string) => void;
  /** Called with the request id after it is successfully claimed. */
  onClaimed?: (id: string) => void;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function AvailableJobsScreen({
  client,
  onSelectRequest,
  onClaimed,
  refreshToken,
}: AvailableJobsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Pass `items` (nullable) directly — `?? []` would create a new array every
  // render while loading, retriggering the hook's effect in an infinite loop.
  const customerNames = useCustomerNames(activeClient, items);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const page = await activeClient.listAvailableRequests({ limit: 20, offset: 0 });
        if (active) {
          setItems(page.items);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load available jobs.');
        }
      } finally {
        if (active) {
          setRefreshing(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken, reload]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReload((current) => current + 1);
  }, []);

  const claim = useCallback(
    async (request: ServiceRequest): Promise<void> => {
      setClaimingId(request.id);
      setError(null);
      try {
        await activeClient.claimRequest(request.id);
        setReload((current) => current + 1);
        onClaimed?.(request.id);
      } catch {
        // A race (someone else claimed it first) or a transient error: refresh
        // so the list reflects the true state.
        setError('Could not claim that job — it may have just been taken.');
        setReload((current) => current + 1);
      } finally {
        setClaimingId(null);
      }
    },
    [activeClient, onClaimed],
  );

  if (error !== null && items === null) {
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

  return (
    <View style={styles.root}>
      {error !== null && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      )}

      {items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>No jobs available right now. Check back soon.</Text>
        </View>
      ) : (
        <FlatList
          testID="available-list"
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => {
                onSelectRequest?.(item.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View job: ${item.description}`}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.status}>{item.status}</Text>
              </View>
              {customerNames[item.customerId] !== undefined && (
                <Text style={styles.customer}>Customer: {customerNames[item.customerId]}</Text>
              )}
              <Text style={styles.description}>{item.description}</Text>
              <Pressable
                style={({ pressed }) => [styles.claim, pressed && styles.claimPressed]}
                onPress={() => {
                  void claim(item);
                }}
                disabled={claimingId === item.id}
                accessibilityRole="button"
                accessibilityLabel={`Claim job: ${item.description}`}
              >
                {claimingId === item.id ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.claimText}>Claim this job</Text>
                )}
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  banner: { backgroundColor: '#fef2f2', padding: 12 },
  bannerText: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  list: { flex: 1 },
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
  customer: { fontSize: 13, color: '#475569', marginBottom: 6 },
  description: { fontSize: 14, color: '#334155', marginBottom: 12 },
  claim: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  claimPressed: { backgroundColor: '#15803d' },
  claimText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
