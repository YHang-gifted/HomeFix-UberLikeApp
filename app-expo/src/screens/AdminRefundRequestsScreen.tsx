import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import type { RefundRequest } from '../../../shared/schemas';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

/** The status tabs for the admin queue: open work to action first, then resolved history. */
const STATUS_FILTERS: { value: RefundRequest['status']; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export interface AdminRefundRequestsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function AdminRefundRequestsScreen({
  client,
  refreshToken,
}: AdminRefundRequestsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [queue, setQueue] = useState<RefundRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RefundRequest['status']>('open');

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const found = await activeClient.listRefundRequests(statusFilter);
        if (active) {
          setQueue(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load the refund queue.');
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken, statusFilter]);

  function setMessage(id: string, message: string): void {
    setMessages((current) => ({ ...current, [id]: message }));
  }

  async function resolve(
    refundRequest: RefundRequest,
    decision: 'approve' | 'reject',
  ): Promise<void> {
    const note = notes[refundRequest.id]?.trim() ?? '';
    if (decision === 'reject' && note === '') {
      setMessage(refundRequest.id, 'Enter a reason to reject.');
      return;
    }
    setBusyId(refundRequest.id);
    setMessage(refundRequest.id, '');
    try {
      await activeClient.resolveRefundRequest(
        refundRequest.id,
        decision,
        decision === 'reject' ? note : undefined,
      );
      // Resolved → no longer in the open queue.
      setQueue((current) => current?.filter((item) => item.id !== refundRequest.id) ?? null);
    } catch (resolveError) {
      setMessage(
        refundRequest.id,
        isApiError(resolveError) ? resolveError.message : 'Could not resolve the request.',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>ADMIN</Text>
      <Text style={styles.heading}>Refund requests</Text>
      <Text style={styles.subheading}>
        Approve to refund the customer, or reject with a reason. Switch tabs to review resolved
        history.
      </Text>

      <View style={styles.filters}>
        {STATUS_FILTERS.map((filter) => {
          const selected = statusFilter === filter.value;
          return (
            <Pressable
              key={filter.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => {
                setStatusFilter(filter.value);
                setQueue(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Show ${filter.label.toLowerCase()} refund requests`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {queue === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : queue.length === 0 ? (
        <Text style={styles.empty}>
          {statusFilter === 'open'
            ? 'No refund requests awaiting review.'
            : `No ${statusFilter} refund requests.`}
        </Text>
      ) : (
        queue.map((refundRequest) => {
          const busy = busyId === refundRequest.id;
          const message = messages[refundRequest.id];
          return (
            <View key={refundRequest.id} style={styles.card}>
              <Text style={styles.cardReason}>“{refundRequest.reason}”</Text>
              <Text style={styles.cardMeta}>
                Requested {new Date(refundRequest.createdAt).toLocaleString()}
              </Text>

              {refundRequest.status === 'open' ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={notes[refundRequest.id] ?? ''}
                    onChangeText={(text) => {
                      setNotes((current) => ({ ...current, [refundRequest.id]: text }));
                    }}
                    placeholder="Note (required to reject)"
                    accessibilityLabel={`Resolution note for ${refundRequest.id}`}
                    editable={!busy}
                  />

                  <View style={styles.actions}>
                    <Pressable
                      style={({ pressed }) => [styles.approve, pressed && styles.approvePressed]}
                      onPress={() => {
                        void resolve(refundRequest, 'approve');
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Approve refund ${refundRequest.id}`}
                    >
                      {busy ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.approveText}>Approve</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.reject, pressed && styles.rejectPressed]}
                      onPress={() => {
                        void resolve(refundRequest, 'reject');
                      }}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Reject refund ${refundRequest.id}`}
                    >
                      <Text style={styles.rejectText}>Reject</Text>
                    </Pressable>
                  </View>

                  {message !== undefined && message !== '' && (
                    <Text style={styles.message}>{message}</Text>
                  )}
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.outcome,
                      refundRequest.status === 'approved'
                        ? styles.outcomeApproved
                        : styles.outcomeRejected,
                    ]}
                  >
                    {refundRequest.status === 'approved' ? 'Approved' : 'Rejected'}
                    {refundRequest.resolvedAt !== undefined
                      ? ` · ${new Date(refundRequest.resolvedAt).toLocaleString()}`
                      : ''}
                  </Text>
                  {refundRequest.resolutionNote !== undefined && (
                    <Text style={styles.outcomeNote}>{refundRequest.resolutionNote}</Text>
                  )}
                </>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand },
  heading: { fontSize: 24, fontWeight: '800', color: colors.ink, marginTop: 2 },
  subheading: { fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 4 },
  loading: { marginTop: spacing.xl },
  empty: { color: colors.inkMuted, fontSize: 15, marginTop: spacing.xl },
  card: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    ...shadow,
  },
  cardReason: { fontSize: 15, color: colors.ink, fontStyle: 'italic' },
  cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: spacing.xs },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.canvas,
    marginTop: spacing.md,
  },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  approve: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  approvePressed: { backgroundColor: colors.brandPressed },
  approveText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  reject: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  rejectPressed: { backgroundColor: colors.dangerSoft },
  rejectText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  message: { marginTop: spacing.sm, fontSize: 13, color: colors.danger },
  filters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.medium,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.inkMuted },
  chipTextSelected: { color: colors.white },
  outcome: { fontSize: 14, fontWeight: '700', marginTop: spacing.md },
  outcomeApproved: { color: colors.brand },
  outcomeRejected: { color: colors.danger },
  outcomeNote: { fontSize: 13, color: colors.inkMuted, marginTop: spacing.xs, fontStyle: 'italic' },
});
