import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import type { AdminStats, ServiceRequestStatus } from '../../../shared/schemas';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

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
      <Text style={styles.eyebrow}>OPERATIONS OVERVIEW</Text>
      <Text style={styles.title}>Today at a glance</Text>
      <Text style={styles.subtitle}>Marketplace activity, cash flow, and worker capacity.</Text>

      <View style={styles.metrics}>
        <View style={[styles.metric, styles.metricBrand]}>
          <Text style={styles.metricLabel}>OPEN REQUESTS</Text>
          <Text style={styles.metricValue}>
            {stats.totalRequests -
              stats.requestsByStatus.completed -
              stats.requestsByStatus.cancelled}
          </Text>
        </View>
        <View style={[styles.metric, styles.metricGold]}>
          <Text style={styles.metricLabel}>COMPLETION RATE</Text>
          <Text style={styles.metricValue}>
            {stats.totalRequests === 0
              ? '0%'
              : `${String(Math.round((stats.requestsByStatus.completed / stats.totalRequests) * 100))}%`}
          </Text>
        </View>
        <View style={[styles.metric, styles.metricCoral]}>
          <Text style={styles.metricLabel}>WORKERS</Text>
          <Text style={styles.metricValue}>{stats.workerCount}</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Request pipeline</Text>
          <StatRow label="Total" value={String(stats.totalRequests)} />
          {STATUS_ORDER.map((status) => (
            <StatRow
              key={status}
              label={statusLabel(status)}
              value={String(stats.requestsByStatus[status])}
            />
          ))}
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Payments</Text>
          <StatRow label="Paid count" value={String(stats.paidPaymentsCount)} />
          <StatRow label="Paid total" value={formatCents(stats.paidAmountCents)} />

          <Text style={styles.sectionTitle}>Payouts</Text>
          <StatRow label="Owed to workers" value={formatCents(stats.pendingPayoutAmountCents)} />
          <StatRow label="Pending count" value={String(stats.pendingPayoutsCount)} />
          <StatRow label="Paid out total" value={formatCents(stats.paidPayoutAmountCents)} />
          <StatRow label="Paid out count" value={String(stats.paidPayoutsCount)} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  eyebrow: { color: colors.brand, fontSize: 10, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 26, fontWeight: '800', marginTop: 3 },
  subtitle: { color: colors.inkMuted, fontSize: 14, marginTop: 4, marginBottom: spacing.xl },
  metrics: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  metric: {
    flexGrow: 1,
    flexBasis: 180,
    minHeight: 112,
    padding: spacing.lg,
    borderRadius: radii.medium,
    justifyContent: 'space-between',
  },
  metricBrand: { backgroundColor: colors.brandSoft },
  metricGold: { backgroundColor: colors.goldSoft },
  metricCoral: { backgroundColor: colors.accentSoft },
  metricLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: '800' },
  metricValue: { color: colors.ink, fontSize: 26, fontWeight: '800' },
  grid: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap', marginTop: spacing.lg },
  panel: {
    flexGrow: 1,
    flexBasis: 300,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radii.medium,
    padding: spacing.lg,
    ...shadow,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  rowLabel: { fontSize: 14, color: colors.inkMuted },
  rowValue: { fontSize: 16, fontWeight: '800', color: colors.ink },
});
