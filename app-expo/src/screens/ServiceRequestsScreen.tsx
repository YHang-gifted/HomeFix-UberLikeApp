import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequest, ServiceRequestStatus } from '../../../shared/schemas';
import { AlertsButton } from '../components/AlertsButton';
import { SearchBox } from '../components/SearchBox';
import { StatusFilter } from '../components/StatusFilter';
import { apiClient } from '../api';

const PAGE_SIZE = 20;

export interface ServiceRequestsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called when the user taps "New request". */
  onNewRequest?: () => void;
  /** Called when the user taps "Log out". */
  onLogout?: () => void;
  /** Called when the user taps "Profile". */
  onViewProfile?: () => void;
  /** Called when the user taps "Alerts". */
  onViewNotifications?: () => void;
  /** Called with the request id when a card is tapped. */
  onSelectRequest?: (id: string) => void;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function ServiceRequestsScreen({
  client,
  onNewRequest,
  onLogout,
  onViewProfile,
  onViewNotifications,
  onSelectRequest,
  refreshToken,
}: ServiceRequestsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServiceRequestStatus | null>(null);
  const [q, setQ] = useState('');
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const page = await activeClient.listServiceRequests({
          status: status ?? undefined,
          q: q.trim() === '' ? undefined : q.trim(),
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (active) {
          setItems(page.items);
          setTotal(page.total);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your requests.');
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
  }, [activeClient, refreshToken, status, q, reload]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReload((current) => current + 1);
  }, []);

  const loadMore = useCallback(async (): Promise<void> => {
    if (items === null || items.length >= total || loadingMore) {
      return;
    }
    setLoadingMore(true);
    try {
      const page = await activeClient.listServiceRequests({
        status: status ?? undefined,
        q: q.trim() === '' ? undefined : q.trim(),
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((current) => [...(current ?? []), ...page.items]);
      setTotal(page.total);
    } catch {
      // Keep the current page on failure; the user can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [activeClient, items, total, loadingMore, status, q]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
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
        <Pressable
          style={styles.logoutButton}
          onPress={() => {
            onViewProfile?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          <Text style={styles.profileText}>Profile</Text>
        </Pressable>
        <AlertsButton
          client={activeClient}
          onPress={onViewNotifications}
          refreshToken={refreshToken}
        />
        <Pressable
          style={styles.logoutButton}
          onPress={() => {
            onLogout?.();
          }}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>

      <StatusFilter value={status} onChange={setStatus} />
      <SearchBox value={q} onChange={setQ} />

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
          testID="request-list"
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => {
                onSelectRequest?.(item.id);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View request: ${item.description}`}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.status}>{item.status}</Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            items.length < total ? (
              <Pressable
                style={({ pressed }) => [styles.loadMore, pressed && styles.loadMorePressed]}
                onPress={() => {
                  void loadMore();
                }}
                disabled={loadingMore}
                accessibilityRole="button"
                accessibilityLabel="Load more"
              >
                {loadingMore ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.loadMoreText}>Load more</Text>
                )}
              </Pressable>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadMore: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  loadMorePressed: { opacity: 0.6 },
  loadMoreText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  newButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  newButtonPressed: { backgroundColor: '#1d4ed8' },
  newButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  logoutButton: { paddingVertical: 12, paddingHorizontal: 4 },
  profileText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
  logoutText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
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
  cardPressed: { backgroundColor: '#f1f5f9' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  category: { fontSize: 15, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  status: { fontSize: 13, color: '#2563eb', textTransform: 'capitalize' },
  description: { fontSize: 14, color: '#334155' },
});
