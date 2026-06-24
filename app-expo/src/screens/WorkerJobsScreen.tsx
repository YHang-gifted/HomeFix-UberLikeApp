import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import {
  nextWorkerStatus,
  workerActionLabel,
} from '../../../app/src/features/serviceRequests/workerStatus';
import type { ServiceRequest, ServiceRequestStatus, WorkerReviews } from '../../../shared/schemas';
import { AlertsButton } from '../components/AlertsButton';
import { SearchBox } from '../components/SearchBox';
import { StatusFilter } from '../components/StatusFilter';
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

  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ServiceRequestStatus | null>(null);
  const [q, setQ] = useState('');
  const [reload, setReload] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WorkerReviews | null>(null);

  useEffect(() => {
    let active = true;

    async function loadJobs(): Promise<void> {
      try {
        const page = await activeClient.listServiceRequests({
          status: status ?? undefined,
          q: q.trim() === '' ? undefined : q.trim(),
        });
        if (active) {
          setItems(page.items);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your jobs.');
        }
      }
    }

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

    void loadJobs();
    void loadRating();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken, reload, status, q]);

  const advance = useCallback(
    async (request: ServiceRequest): Promise<void> => {
      const next = nextWorkerStatus(request.status);
      if (next === null) {
        return;
      }
      setUpdatingId(request.id);
      try {
        await activeClient.updateServiceRequestStatus(request.id, next);
        setReload((current) => current + 1);
      } catch {
        setError('Could not update the job. Please try again.');
      } finally {
        setUpdatingId(null);
      }
    },
    [activeClient],
  );

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
          <Text style={styles.empty}>No jobs assigned to you yet.</Text>
        </View>
      )}

      {error === null && items !== null && items.length > 0 && (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(item) => item.id}
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
