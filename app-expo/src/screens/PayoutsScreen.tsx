import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import type { Payout } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface PayoutsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function PayoutsScreen({ client, refreshToken }: PayoutsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.listMyPayouts();
        if (active) {
          setPayouts(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your payouts.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (payouts === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (payouts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>You have no payouts yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={payouts}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <Text style={styles.hint}>Your net earnings, paid out after each completed payment.</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={styles.amount}>{formatCents(item.amountCents)}</Text>
            <Text style={[styles.status, item.status === 'paid' && styles.statusPaid]}>
              {item.status === 'paid' ? 'Paid out' : 'Pending'}
            </Text>
          </View>
          <Text style={styles.time}>Scheduled {new Date(item.createdAt).toLocaleString()}</Text>
          {item.paidAt !== undefined && (
            <Text style={styles.time}>Paid out {new Date(item.paidAt).toLocaleString()}</Text>
          )}
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
  hint: { fontSize: 13, color: '#64748b', padding: 16, paddingBottom: 8 },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  status: { fontSize: 13, fontWeight: '600', color: '#d97706', textTransform: 'capitalize' },
  statusPaid: { color: '#16a34a' },
  time: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
});
