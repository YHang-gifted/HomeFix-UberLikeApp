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
import { StatusBadge } from '../components/StatusBadge';
import { StatusFilter } from '../components/StatusFilter';
import { useCustomerNames } from '../hooks/useCustomerNames';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useServiceRequestPage } from '../hooks/useServiceRequestPage';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

export interface WorkerJobsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called when the user taps "Log out". */
  onLogout?: () => void;
  /** Called when the user taps "Profile". */
  onViewProfile?: () => void;
  /** Called when the user taps "Alerts". */
  onViewNotifications?: () => void;
  /** Called when the user taps "Find work". */
  onViewAvailable?: () => void;
  /** Called when the user taps "Certifications". */
  onViewCertifications?: () => void;
  /** Called when the user taps "Payments". */
  onViewPayments?: () => void;
  /** Called when the user taps "Payouts". */
  onViewPayouts?: () => void;
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
  onViewAvailable,
  onViewCertifications,
  onViewPayments,
  onViewPayouts,
  onSelectRequest,
  refreshToken,
}: WorkerJobsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [status, setStatus] = useState<ServiceRequestStatus | null>(null);
  const [searchText, setSearchText] = useState('');
  const q = useDebouncedValue(searchText, 300);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<WorkerReviews | null>(null);

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
  const customerNames = useCustomerNames(activeClient, page.items);
  const { reload } = page;

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
        reload();
      } catch {
        setActionError('Could not update the job. Please try again.');
      } finally {
        setUpdatingId(null);
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
        <View>
          <Text style={styles.eyebrow}>PRO WORKSPACE</Text>
          <Text style={styles.heading}>Assigned jobs</Text>
          {reviews !== null && <Text style={styles.rating}>{ratingText(reviews)}</Text>}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              onViewAvailable?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Find work"
          >
            <Text style={styles.profileText}>Find work</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onViewCertifications?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Certifications"
          >
            <Text style={styles.profileText}>Certifications</Text>
          </Pressable>
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
              onViewPayments?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Payments"
          >
            <Text style={styles.profileText}>Payments</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onViewPayouts?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Payouts"
          >
            <Text style={styles.profileText}>Payouts</Text>
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
                  <StatusBadge status={item.status} />
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
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    gap: spacing.lg,
    flexWrap: 'wrap',
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand },
  heading: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  rating: { fontSize: 13, color: colors.gold, fontWeight: '700', marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  profileText: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  logoutText: { color: colors.inkMuted, fontSize: 13, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  empty: { color: colors.inkMuted, fontSize: 15, textAlign: 'center' },
  list: { flex: 1, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: spacing.lg,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
  category: { fontSize: 15, fontWeight: '800', color: colors.ink, textTransform: 'capitalize' },
  customer: { fontSize: 12, fontWeight: '600', color: colors.info, marginBottom: 6 },
  description: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginBottom: 12 },
  action: {
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionPressed: { backgroundColor: colors.brandPressed },
  actionText: { color: colors.white, fontSize: 14, fontWeight: '700' },
});
