import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import {
  nextWorkerStatus,
  workerActionLabel,
} from '../../../app/src/features/serviceRequests/workerStatus';
import type { ServiceRequest, ServiceRequestStatus, WorkerReviews } from '../../../shared/schemas';
import { AlertsButton } from '../components/AlertsButton';
import { LoadMoreFooter } from '../components/LoadMoreFooter';
import { SearchBox } from '../components/SearchBox';
import { StatusFilter } from '../components/StatusFilter';
import { useServiceRequestPage } from '../hooks/useServiceRequestPage';
import { apiClient } from '../api';

export interface WorkerJobsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
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

function ratingText(reviews: WorkerReviews): string {
  if (reviews.reviewCount === 0) {
    return 'No ratings yet';
  }
  return `${reviews.averageRating.toFixed(1)} ★ (${String(reviews.reviewCount)} reviews)`;
}

export function WorkerJobsScreen({
  client,
  onLogout,
  onViewProfile,
  onViewNotifications,
  onSelectRequest,
  refreshToken,
}: WorkerJobsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [status, setStatus] = useState<ServiceRequestStatus | null>(null);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WorkerReviews | null>(null);
  const [customerNames, setCustomerNames] = useState<Record<string, string>>({});

  const onSettled = useCallback(() => {
    setRefreshing(false);
  }, []);

  const page = useServiceRequestPage({
    client: activeClient,
    status,
    q,
    refreshToken,
    errorMessage: 'Could not load your jobs.',
    onSettled,
  });
  const requests = page.items;

  useEffect(() => {
    let active = true;

    async function loadNames(): Promise<void> {
      if (requests === null) {
        return;
      }
      try {
        const ids = [...new Set(requests.map((request) => request.customerId))];
        const users = await activeClient.listUsers(ids);
        if (active) {
          const names: Record<string, string> = {};
          for (const user of users) {
            names[user.id] = user.displayName;
          }
          setCustomerNames(names);
        }
      } catch {
        // Customer names are secondary; ignore failures.
      }
    }

    void loadNames();
    return () => {
      active = false;
    };
  }, [activeClient, requests]);

  useEffect(() => {
    let active = true;

    async function loadRating(): Promise<void> {
      const principal = activeClient.getPrincipal();
      if (principal === null) {
        return;
      }
      try {
        const summary = await activeClient.getWorkerReviews(principal.id);
        if (active) {
          setReviews(summary);
        }
      } catch {
        // Rating is secondary; ignore failures.
      }
    }

    void loadRating();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  const advance = useCallback(
    async (request: ServiceRequest): Promise<void> => {
      const next = nextWorkerStatus(request.status);
      if (next === null) {
        return;
      }
      setUpdatingId(request.id);
      setActionError(null);
      try {
        await activeClient.updateServiceRequestStatus(request.id, next);
        page.reload();
      } catch {
        setActionError('Could not update the job. Please try again.');
      } finally {
        setUpdatingId(null);
      }
    },
    [activeClient, page.reload],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    page.reload();
  }, [page.reload]);

  const displayError = page.error ?? actionError;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Assigned jobs</Text>
          {reviews !== null && <Text style={styles.rating}>{ratingText(reviews)}</Text>}
        </View>
        <View style={styles.headerActions}>
          <Pressable
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
            onPress={() => {
              onLogout?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      </View>

      <StatusFilter value={status} onChange={setStatus} />
      <SearchBox value={q} onChange={setQ} />

      {displayError !== null && (
        <View style={styles.centered}>
          <Text style={styles.error}>{displayError}</Text>
        </View>
      )}

      {displayError === null && page.items === null && (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      )}

      {displayError === null && page.items !== null && page.items.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.empty}>No jobs assigned to you yet.</Text>
        </View>
      )}

      {displayError === null && page.items !== null && page.items.length > 0 && (
        <FlatList
          testID="jobs-list"
          style={styles.list}
          data={page.items}
          keyExtractor={(item) => item.id}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListFooterComponent={
            <LoadMoreFooter
              visible={page.hasMore}
              loading={page.loadingMore}
              onPress={() => {
                void page.loadMore();
              }}
            />
          }
          renderItem={({ item }) => {
            const label = workerActionLabel(item.status);
            return (
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
                {label !== null && (
                  <Pressable
                    style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                    onPress={() => {
                      void advance(item);
                    }}
                    disabled={updatingId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                  >
                    {updatingId === item.id ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.actionText}>{label}</Text>
                    )}
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  heading: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  rating: { fontSize: 13, color: '#f59e0b', fontWeight: '600', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  category: { fontSize: 15, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  status: { fontSize: 13, color: '#2563eb', textTransform: 'capitalize' },
  customer: { fontSize: 13, color: '#475569', marginBottom: 6 },
  description: { fontSize: 14, color: '#334155', marginBottom: 12 },
  action: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionPressed: { backgroundColor: '#1d4ed8' },
  actionText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
