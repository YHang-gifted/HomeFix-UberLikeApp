import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { customerCanCancel } from '../../../app/src/features/serviceRequests/customerStatus';
import type { ServiceRequest } from '../../../shared/schemas';
import { apiClient } from '../api';

export interface RequestDetailScreenProps {
  /** The request to display. */
  requestId: string;
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called after the request is cancelled. */
  onCancelled?: () => void;
}

export function RequestDetailScreen({
  requestId,
  client,
  onCancelled,
}: RequestDetailScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.getServiceRequest(requestId);
        if (active) {
          setRequest(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load this request.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, requestId]);

  async function cancel(): Promise<void> {
    setCancelling(true);
    try {
      await activeClient.updateServiceRequestStatus(requestId, 'cancelled');
      onCancelled?.();
    } catch {
      setError('Could not cancel the request. Please try again.');
      setCancelling(false);
    }
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (request === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.category}>{request.category}</Text>
        <Text style={styles.status}>{request.status}</Text>
      </View>

      <Text style={styles.label}>Description</Text>
      <Text style={styles.value}>{request.description}</Text>

      <Text style={styles.label}>Location</Text>
      <Text
        style={styles.value}
      >{`${request.location.latitude}, ${request.location.longitude}`}</Text>

      {customerCanCancel(request.status) && (
        <Pressable
          style={({ pressed }) => [styles.cancel, (pressed || cancelling) && styles.cancelPressed]}
          onPress={() => {
            void cancel();
          }}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel="Cancel request"
        >
          {cancelling ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.cancelText}>Cancel request</Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc2626', fontSize: 15, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  category: { fontSize: 20, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  status: { fontSize: 14, color: '#2563eb', textTransform: 'capitalize' },
  label: { fontSize: 13, fontWeight: '600', color: '#64748b', marginTop: 20, marginBottom: 4 },
  value: { fontSize: 16, color: '#0f172a' },
  cancel: {
    marginTop: 32,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelPressed: { backgroundColor: '#b91c1c' },
  cancelText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
