import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import type { AuditAction, AuditEvent } from '../../../shared/schemas';
import { apiClient } from '../api';

const ACTION_LABELS: Record<AuditAction, string> = {
  'service_request.created': 'Created request',
  'service_request.assigned': 'Assigned worker',
  'service_request.status_changed': 'Status changed',
  'account.registered': 'Registered account',
  'account.logged_in': 'Signed in',
  'account.login_failed': 'Failed sign-in',
  'account.suspended': 'Suspended account',
  'account.reinstated': 'Reinstated account',
  'account.deleted': 'Deleted account',
  'account.password_changed': 'Changed password',
  'account.sessions_revoked': 'Signed out all devices',
  'profile.updated': 'Updated profile',
  'device.registered': 'Registered a device',
  'quote.proposed': 'Proposed quote',
  'quote.accepted': 'Accepted quote',
  'quote.declined': 'Declined quote',
  'schedule.proposed': 'Proposed a visit time',
  'schedule.confirmed': 'Confirmed the visit time',
  'visit.en_route': 'Worker on the way',
  'payment.created': 'Created payment',
  'payment.refunded': 'Refunded payment',
  'certification.submitted': 'Submitted certification',
  'certification.verified': 'Verified certification',
  'certification.rejected': 'Rejected certification',
  'quote.revised': 'Revised price (extra work)',
  'refund_request.created': 'Requested refund',
  'refund_request.approved': 'Approved refund request',
  'refund_request.rejected': 'Rejected refund request',
};

function detailsText(details: Record<string, string> | undefined): string | null {
  if (details === undefined) {
    return null;
  }
  const entries = Object.entries(details);
  if (entries.length === 0) {
    return null;
  }
  return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
}

export interface AuditLogScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus). */
  refreshToken?: number;
}

export function AuditLogScreen({ client, refreshToken }: AuditLogScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [items, setItems] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const page = await activeClient.listAuditEvents();
        if (active) {
          setItems(page.items);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load the audit log.');
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

  if (items === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>No audit events yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const details = detailsText(item.details);
        return (
          <View style={styles.row}>
            <Text style={styles.action}>{ACTION_LABELS[item.action]}</Text>
            <Text style={styles.meta}>by {item.actorRole ?? 'anonymous'}</Text>
            {details !== null && <Text style={styles.details}>{details}</Text>}
            <Text style={styles.time}>{new Date(item.occurredAt).toLocaleString()}</Text>
          </View>
        );
      }}
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
  action: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  meta: { fontSize: 13, color: '#2563eb', marginTop: 2, textTransform: 'capitalize' },
  details: { fontSize: 13, color: '#334155', marginTop: 2 },
  time: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
});
