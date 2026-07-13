import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import type { OpenCheckout } from '../../../app/src/features/payments/checkout';
import { formatCents } from '../../../app/src/features/payments/paymentFormat';
import { derivePayoutSetupView } from '../../../app/src/features/payouts/payoutSetupView';
import type { EarningsSummary, PayoutAccountStatus, Payout } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface PayoutsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
  /** Opens the Stripe Connect onboarding page. Injected; wired in App.tsx. */
  openCheckout?: OpenCheckout;
  /**
   * Whether to offer payout onboarding. Defaults from `EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED`
   * — the operator sets it when Stripe Connect is configured on the server.
   */
  payoutsEnabled?: boolean;
}

export function PayoutsScreen({
  client,
  refreshToken,
  openCheckout,
  payoutsEnabled = process.env.EXPO_PUBLIC_CONNECT_PAYOUTS_ENABLED === 'true',
}: PayoutsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [status, setStatus] = useState<PayoutAccountStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [onboardError, setOnboardError] = useState<string | null>(null);

  const setup = derivePayoutSetupView(payoutsEnabled, status);

  async function setUpPayouts(): Promise<void> {
    setOnboardError(null);
    setOnboarding(true);
    try {
      // The same endpoint serves all three states: it reuses the worker's existing connected
      // account when there is one and just mints a fresh hosted link, so "Finish payout setup"
      // and "Update payout details" need no separate call.
      const { url } = await activeClient.startConnectOnboarding();
      if (openCheckout !== undefined) {
        await openCheckout(url);
      }
    } catch (onboardFailure) {
      setOnboardError(
        isApiError(onboardFailure) ? onboardFailure.message : 'Could not start payout setup.',
      );
    } finally {
      setOnboarding(false);
    }
  }

  function setupButton(): ReactElement | null {
    if (!setup.visible || setup.actionLabel === null) {
      return null;
    }
    const quiet = setup.tone === 'done';
    return (
      <View style={styles.setup}>
        <Text style={[styles.setupTitle, setup.tone === 'waiting' && styles.setupTitleWaiting]}>
          {setup.title}
        </Text>
        <Text style={styles.setupDetail}>{setup.detail}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.setupButton,
            quiet && styles.setupButtonQuiet,
            pressed && styles.setupButtonPressed,
          ]}
          onPress={() => {
            void setUpPayouts();
          }}
          disabled={onboarding}
          accessibilityRole="button"
          accessibilityLabel={setup.actionLabel}
        >
          {onboarding ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={[styles.setupButtonText, quiet && styles.setupButtonTextQuiet]}>
              {setup.actionLabel}
            </Text>
          )}
        </Pressable>
        {onboardError !== null && <Text style={styles.error}>{onboardError}</Text>}
      </View>
    );
  }

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
      // So is the payout status: if we cannot read it, the setup section stays hidden rather
      // than guessing. Offering "Set up payouts" to someone who has already done it is exactly
      // the bug being fixed here, so a failure must not fall back to that.
      try {
        const me = await activeClient.getMe();
        if (active) {
          setStatus(me.payoutAccountStatus);
        }
      } catch {
        // Leave the setup section hidden.
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
      <View style={styles.emptyRoot}>
        {setupButton()}
        <View style={styles.centered}>
          <Text style={styles.empty}>You have no payouts yet.</Text>
        </View>
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
          {setupButton()}
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
  emptyRoot: { flex: 1, backgroundColor: '#ffffff' },
  setup: { padding: 16, paddingBottom: 8 },
  setupTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  // The half-finished state is the one worth catching the eye: it explains why the money is
  // sitting still.
  setupTitleWaiting: { color: '#b45309' },
  setupDetail: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  setupButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  setupButtonPressed: { backgroundColor: '#eff6ff' },
  setupButtonText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  // Once payouts work, "Update payout details" is housekeeping — not something to shout about.
  setupButtonQuiet: { borderColor: '#cbd5e1' },
  setupButtonTextQuiet: { color: '#475569', fontWeight: '600' },
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
