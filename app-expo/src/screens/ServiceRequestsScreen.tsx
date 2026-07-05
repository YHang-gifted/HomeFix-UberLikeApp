import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { ServiceRequestStatus } from '../../../shared/schemas';
import { AlertsButton } from '../components/AlertsButton';
import { LoadMoreFooter } from '../components/LoadMoreFooter';
import { SearchBox } from '../components/SearchBox';
import { StatusBadge } from '../components/StatusBadge';
import { StatusFilter } from '../components/StatusFilter';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useServiceRequestPage } from '../hooks/useServiceRequestPage';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

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
  /** Called when the user taps "Favorites". */
  onViewFavorites?: () => void;
  /** Called when the user taps "Payments". */
  onViewPayments?: () => void;
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
  onViewFavorites,
  onViewPayments,
  onSelectRequest,
  refreshToken,
}: ServiceRequestsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [status, setStatus] = useState<ServiceRequestStatus | null>(null);
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const q = useDebouncedValue(searchText, 300);

  const onSettled = useCallback(() => {
    setRefreshing(false);
  }, []);

  const page = useServiceRequestPage({
    client: activeClient,
    status,
    q,
    refreshToken,
    errorMessage: 'Could not load your requests.',
    onSettled,
  });

  const { reload } = page;
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
  }, [reload]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CUSTOMER WORKSPACE</Text>
          <Text style={styles.heading}>Your repairs</Text>
          <Text style={styles.subheading}>Track every request from first note to final fix.</Text>
        </View>
        <View style={styles.headerActions}>
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
          <Pressable
            style={styles.logoutButton}
            onPress={() => {
              onViewFavorites?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Favorites"
          >
            <Text style={styles.profileText}>Favorites</Text>
          </Pressable>
          <Pressable
            style={styles.logoutButton}
            onPress={() => {
              onViewPayments?.();
            }}
            accessibilityRole="button"
            accessibilityLabel="Payments"
          >
            <Text style={styles.profileText}>Payments</Text>
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
      </View>

      <StatusFilter value={status} onChange={setStatus} />
      <SearchBox value={searchText} onChange={setSearchText} />

      {page.error !== null && (
        <View style={styles.centered}>
          <Text style={styles.error}>{page.error}</Text>
        </View>
      )}

      {page.error === null && page.items === null && (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      )}

      {page.error === null && page.items !== null && page.items.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.empty}>You have no service requests yet.</Text>
        </View>
      )}

      {page.error === null && page.items !== null && page.items.length > 0 && (
        <FlatList
          testID="request-list"
          style={styles.list}
          data={page.items}
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
                <StatusBadge status={item.status} />
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <Text style={styles.cardMeta}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            <LoadMoreFooter
              visible={page.hasMore}
              loading={page.loadingMore}
              onPress={() => {
                void page.loadMore();
              }}
            />
          }
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
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    flexWrap: 'wrap',
  },
  headerCopy: { flexGrow: 1, minWidth: 220 },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand },
  heading: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  subheading: { fontSize: 13, color: colors.inkMuted, marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  newButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  newButtonPressed: { backgroundColor: colors.brandPressed },
  newButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  logoutButton: { paddingVertical: 10, paddingHorizontal: 2 },
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
  cardPressed: { backgroundColor: colors.brandSoft },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, gap: 12 },
  category: { fontSize: 15, fontWeight: '800', color: colors.ink, textTransform: 'capitalize' },
  description: { fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  cardMeta: { fontSize: 11, color: colors.inkMuted, marginTop: spacing.md },
});
