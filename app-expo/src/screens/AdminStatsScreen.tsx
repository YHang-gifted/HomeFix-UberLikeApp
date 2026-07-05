import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import type { AdminStats, ServiceRequestStatus } from '../../../shared/schemas';
import { apiClient } from '../api';

const STATUS_ORDER: ServiceRequestStatus[] = [
  'pending',
  'matched',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
];

function statusLabel(status: ServiceRequestStatus): string {
  const spaced = status.replace('_', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface AdminStatsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

function StatRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function AdminStatsScreen({ client, refreshToken }: AdminStatsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.getAdminStats();
        if (active) {
          setStats(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load the dashboard.');
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

  if (stats === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Requests</Text>
      <StatRow label="Total" value={String(stats.totalRequests)} />
      {STATUS_ORDER.map((status) => (
        <StatRow
          key={status}
          label={statusLabel(status)}
          value={String(stats.requestsByStatus[status])}
        />
      ))}

      <Text style={styles.sectionTitle}>Payments</Text>
      <StatRow label="Paid count" value={String(stats.paidPaymentsCount)} />
      <StatRow label="Paid total" value={formatCents(stats.paidAmountCents)} />

      <Text style={styles.sectionTitle}>Payouts</Text>
      <StatRow label="Owed to workers" value={formatCents(stats.pendingPayoutAmountCents)} />
      <StatRow label="Pending count" value={String(stats.pendingPayoutsCount)} />
      <StatRow label="Paid out total" value={formatCents(stats.paidPayoutAmountCents)} />
      <StatRow label="Paid out count" value={String(stats.paidPayoutsCount)} />

      <Text style={styles.sectionTitle}>Workers</Text>
      <StatRow label="Total workers" value={String(stats.workerCount)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowLabel: { fontSize: 15, color: '#334155' },
  rowValue: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
});
