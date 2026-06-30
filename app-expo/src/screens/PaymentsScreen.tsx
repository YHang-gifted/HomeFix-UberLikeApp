import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import { hasPlatformFee, paymentSplit } from '../../../app/src/features/payments/paymentSplit';
import type { Payment } from '../../../shared/schemas';
import { apiClient } from '../api';

/** "Worker net NT$1,275.00 · Platform fee NT$225.00" for a payment with a fee. */
function splitLine(payment: Payment): string {
  const split = paymentSplit(payment);
  return `Worker net ${formatCents(split.workerNetCents)} · Platform fee ${formatCents(split.platformFeeCents)}`;
}

export interface PaymentsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called with the request id when a receipt is tapped. */
  onSelectRequest?: (id: string) => void;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function PaymentsScreen({
  client,
  onSelectRequest,
  refreshToken,
}: PaymentsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.listMyPayments();
        if (active) {
          setPayments(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your payments.');
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

  if (payments === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (payments.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>You have no payments yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={payments}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => {
            onSelectRequest?.(item.requestId);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Payment ${formatCents(item.amountCents)}, ${item.status}`}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.amount}>{formatCents(item.amountCents)}</Text>
            <Text style={[styles.status, item.status === 'paid' && styles.statusPaid]}>
              {item.status}
            </Text>
          </View>
          {hasPlatformFee(item) && <Text style={styles.split}>{splitLine(item)}</Text>}
          <Text style={styles.time}>Created {new Date(item.createdAt).toLocaleString()}</Text>
          {item.paidAt !== undefined && (
            <Text style={styles.time}>Paid {new Date(item.paidAt).toLocaleString()}</Text>
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  empty: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: { backgroundColor: '#f1f5f9' },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  status: { fontSize: 13, fontWeight: '600', color: '#64748b', textTransform: 'capitalize' },
  statusPaid: { color: '#16a34a' },
  split: { fontSize: 13, color: '#475569', marginTop: 6 },
  time: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
});
