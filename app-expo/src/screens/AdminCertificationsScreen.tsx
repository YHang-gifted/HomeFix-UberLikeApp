import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import type { Certification } from '../../../shared/schemas';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

export interface AdminCertificationsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function AdminCertificationsScreen({
  client,
  refreshToken,
}: AdminCertificationsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [pending, setPending] = useState<Certification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      try {
        const found = await activeClient.listAdminCertifications('pending');
        if (active) {
          setPending(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load the review queue.');
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  function setMessage(id: string, message: string): void {
    setMessages((current) => ({ ...current, [id]: message }));
  }

  async function review(
    certification: Certification,
    decision: 'verify' | 'reject',
  ): Promise<void> {
    const reason = reasons[certification.id]?.trim() ?? '';
    if (decision === 'reject' && reason === '') {
      setMessage(certification.id, 'Enter a reason to reject.');
      return;
    }
    setBusyId(certification.id);
    setMessage(certification.id, '');
    try {
      await activeClient.reviewCertification(
        certification.id,
        decision,
        decision === 'reject' ? reason : undefined,
      );
      setPending((current) => current?.filter((item) => item.id !== certification.id) ?? null);
    } catch (reviewError) {
      setMessage(
        certification.id,
        isApiError(reviewError) ? reviewError.message : 'Could not submit the review.',
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
      <Text style={styles.heading}>Certification review</Text>
      <Text style={styles.subheading}>
        Verify a worker&apos;s credential to unlock that category.
      </Text>

      {pending === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : pending.length === 0 ? (
        <Text style={styles.empty}>No certifications awaiting review.</Text>
      ) : (
        pending.map((certification) => {
          const busy = busyId === certification.id;
          const message = messages[certification.id];
          return (
            <View key={certification.id} style={styles.card}>
              <Text style={styles.cardTitle}>{certification.title}</Text>
              <Text style={styles.cardCategory}>{certification.category}</Text>
              <Pressable
                onPress={() => {
                  void Linking.openURL(certification.documentUrl);
                }}
                accessibilityRole="button"
                accessibilityLabel="View document"
              >
                <Text style={styles.docLink}>View document</Text>
              </Pressable>

              <TextInput
                style={styles.input}
                value={reasons[certification.id] ?? ''}
                onChangeText={(text) => {
                  setReasons((current) => ({ ...current, [certification.id]: text }));
                }}
                placeholder="Reason (required to reject)"
                accessibilityLabel={`Rejection reason for ${certification.title}`}
                editable={!busy}
              />

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.verify, pressed && styles.verifyPressed]}
                  onPress={() => {
                    void review(certification, 'verify');
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Verify ${certification.title}`}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.verifyText}>Verify</Text>
                  )}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.reject, pressed && styles.rejectPressed]}
                  onPress={() => {
                    void review(certification, 'reject');
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Reject ${certification.title}`}
                >
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
              </View>

              {message !== undefined && message !== '' && (
                <Text style={styles.message}>{message}</Text>
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
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardCategory: { fontSize: 13, color: colors.inkMuted, textTransform: 'capitalize', marginTop: 2 },
  docLink: { fontSize: 14, fontWeight: '700', color: colors.brand, marginTop: spacing.sm },
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
  verify: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  verifyPressed: { backgroundColor: colors.brandPressed },
  verifyText: { color: colors.white, fontSize: 15, fontWeight: '700' },
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
});
