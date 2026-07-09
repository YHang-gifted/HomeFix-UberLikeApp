import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type {
  ServiceCategory,
  ServiceRequest,
  ServiceRequestStatus,
  WorkerRating,
  WorkerSummary,
} from '../../../shared/schemas';
import { CategoryFilter } from '../components/CategoryFilter';
import { LoadMoreFooter } from '../components/LoadMoreFooter';
import { RequestLocationThumbnail } from '../components/RequestLocationThumbnail';
import { SearchBox } from '../components/SearchBox';
import { StatusFilter } from '../components/StatusFilter';
import { useCustomerNames } from '../hooks/useCustomerNames';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useServiceRequestPage } from '../hooks/useServiceRequestPage';
import { apiClient } from '../api';

export interface AdminRequestsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called when the user taps "Log out". */
  onLogout?: () => void;
  /** Called when the user taps "Profile". */
  onViewProfile?: () => void;
  /** Called when the user taps "Audit log". */
  onViewAudit?: () => void;
  /** Called when the user taps "Dashboard". */
  onViewStats?: () => void;
  /** Called when the user taps "Users". */
  onViewUsers?: () => void;
  /** Called when the user taps "Certifications". */
  onViewCertifications?: () => void;
  /** Called with the request id when a card is tapped. */
  onSelectRequest?: (id: string) => void;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function AdminRequestsScreen({
  client,
  onLogout,
  onViewAudit,
  onViewStats,
  onViewUsers,
  onViewCertifications,
  onViewProfile,
  onSelectRequest,
  refreshToken,
}: AdminRequestsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [status, setStatus] = useState<ServiceRequestStatus | null>(null);
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [searchText, setSearchText] = useState('');
  const q = useDebouncedValue(searchText, 300);
  const [refreshing, setRefreshing] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, WorkerRating>>({});

  const onSettled = useCallback(() => {
    setRefreshing(false);
  }, []);

  const page = useServiceRequestPage({
    client: activeClient,
    status,
    q,
    category,
    refreshToken,
    errorMessage: 'Could not load requests.',
    onSettled,
  });
  const customerNames = useCustomerNames(activeClient, page.items);
  const { reload } = page;

  // Best worker first: highest average rating, then most reviews. Workers with
  // no reviews yet sort to the bottom so admins see proven workers first.
  const sortedWorkers = useMemo(() => {
    const score = (id: string): number => {
      const rating = ratings[id];
      return rating !== undefined && rating.reviewCount > 0 ? rating.averageRating : -1;
    };
    return [...workers].sort((a, b) => {
      const byScore = score(b.id) - score(a.id);
      if (byScore !== 0) {
        return byScore;
      }
      return (ratings[b.id]?.reviewCount ?? 0) - (ratings[a.id]?.reviewCount ?? 0);
    });
  }, [workers, ratings]);

  useEffect(() => {
    let active = true;

    async function loadWorkers(): Promise<void> {
      try {
        const [workerList, workerRatings] = await Promise.all([
          activeClient.listWorkers(),
          activeClient.listWorkerRatings(),
        ]);
        if (active) {
          setWorkers(workerList);
          const byWorker: Record<string, WorkerRating> = {};
          for (const rating of workerRatings) {
            byWorker[rating.workerId] = rating;
          }
          setRatings(byWorker);
        }
      } catch {
        // Workers/ratings are secondary; ignore failures.
      }
    }

    void loadWorkers();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  const assign = useCallback(
    async (request: ServiceRequest, workerId: string): Promise<void> => {
      setAssigningId(request.id);
      setActionError(null);
      try {
        await activeClient.assignWorker(request.id, workerId);
        reload();
      } catch {
        setActionError('Could not assign the worker. Please try again.');
      } finally {
        setAssigningId(null);
      }
    },
    [activeClient, reload],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
  }, [reload]);

  const displayError = page.error ?? actionError;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.heading}>All requests</Text>
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
          <Pressable
            onPress={() => {
              onViewStats?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Dashboard"
          >
            <Text style={styles.auditText}>Dashboard</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onViewUsers?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Users"
          >
            <Text style={styles.auditText}>Users</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onViewCertifications?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Certifications"
          >
            <Text style={styles.auditText}>Certifications</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onViewAudit?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Audit log"
          >
            <Text style={styles.auditText}>Audit log</Text>
          </Pressable>
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
      <CategoryFilter value={category} onChange={setCategory} />
      <SearchBox value={searchText} onChange={setSearchText} />

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
          <Text style={styles.empty}>There are no requests yet.</Text>
        </View>
      )}

      {displayError === null && page.items !== null && page.items.length > 0 && (
        <FlatList
          testID="admin-request-list"
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
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
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
              {customerNames[item.customerId] !== undefined && (
                <Text style={styles.customer}>Customer: {customerNames[item.customerId]}</Text>
              )}
              <Text style={styles.description}>{item.description}</Text>
              <RequestLocationThumbnail location={item.location} />

              {item.status === 'pending' && (
                <View style={styles.assignRow}>
                  {sortedWorkers.map((worker) => {
                    const summary = ratings[worker.id];
                    const ratingLabel =
                      summary === undefined
                        ? null
                        : summary.reviewCount === 0
                          ? 'No ratings yet'
                          : `${summary.averageRating.toFixed(1)} ★ (${String(summary.reviewCount)})`;
                    return (
                      <View key={worker.id} style={styles.assignWorker}>
                        <Pressable
                          style={({ pressed }) => [styles.assign, pressed && styles.assignPressed]}
                          onPress={() => {
                            void assign(item, worker.id);
                          }}
                          disabled={assigningId === item.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Assign to ${worker.displayName}`}
                        >
                          {assigningId === item.id ? (
                            <ActivityIndicator color="#ffffff" />
                          ) : (
                            <Text style={styles.assignText}>Assign to {worker.displayName}</Text>
                          )}
                        </Pressable>
                        {ratingLabel !== null && (
                          <Text style={styles.workerRating}>{ratingLabel}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </Pressable>
          )}
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  auditText: { color: '#2563eb', fontSize: 14, fontWeight: '600' },
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
  description: { fontSize: 14, color: '#334155' },
  assignRow: { marginTop: 12, gap: 12 },
  assignWorker: { gap: 4 },
  workerRating: { fontSize: 12, color: '#f59e0b', fontWeight: '600', textAlign: 'center' },
  assign: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  assignPressed: { backgroundColor: '#1d4ed8' },
  assignText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
});
