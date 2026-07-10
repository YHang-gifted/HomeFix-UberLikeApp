import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import type { EarningsSummary, Payout } from '../../../shared/schemas';
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
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
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
        return;
      }
      // The summary card is best-effort — the list still renders if it fails.
      try {
        const summary = await activeClient.getMyEarnings();
        if (active) {
          setEarnings(summary);
        }
      } catch {
        // Leave the summary hidden.
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
        <View>
          {earnings !== null && (
            <View style={styles.summary} accessibilityLabel="Earnings summary">
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Paid out</Text>
                <Text style={styles.summaryPaid}>{formatCents(earnings.paidAmountCents)}</Text>
                <Text style={styles.summaryCount}>{earnings.paidCount} payout(s)</Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>Pending</Text>
                <Text style={styles.summaryPending}>
                  {formatCents(earnings.pendingAmountCents)}
                </Text>
                <Text style={styles.summaryCount}>{earnings.pendingCount} scheduled</Text>
              </View>
            </View>
          )}
          <Text style={styles.hint}>Your net earnings, paid out after each completed payment.</Text>
        </View>
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
  summary: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 8,
  },
  summaryCol: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  summaryPaid: { fontSize: 20, fontWeight: '800', color: '#16a34a', marginTop: 4 },
  summaryPending: { fontSize: 20, fontWeight: '800', color: '#d97706', marginTop: 4 },
  summaryCount: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
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
