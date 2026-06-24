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
import { customerCanCancel } from '../../../app/src/features/serviceRequests/customerStatus';
import type { ServiceRequest } from '../../../shared/schemas';
import { apiClient } from '../api';

const RATINGS = [1, 2, 3, 4, 5];

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
  const principal = useMemo(() => activeClient.getPrincipal(), [activeClient]);

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.getServiceRequest(requestId);
        if (active) {
          setRequest(found);
          setError(null);
        }
        try {
          const customer = await activeClient.getUser(found.customerId);
          if (active) {
            setCustomerName(customer.displayName);
          }
        } catch {
          // Fall back to showing the customer id.
        }
        if (found.workerId !== undefined) {
          try {
            const worker = await activeClient.getWorker(found.workerId);
            if (active) {
              setWorkerName(worker.displayName);
            }
          } catch {
            // Fall back to showing the worker id.
          }
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

  async function submitReview(): Promise<void> {
    if (rating === null) {
      return;
    }
    setSubmittingReview(true);
    setReviewMessage(null);
    const trimmed = comment.trim();
    try {
      await activeClient.createReview(requestId, {
        rating,
        ...(trimmed.length > 0 ? { comment: trimmed } : {}),
      });
      setReviewDone(true);
      setReviewMessage('Thanks for your review!');
    } catch (submitError) {
      if (isApiError(submitError) && submitError.status === 409) {
        setReviewDone(true);
        setReviewMessage('You have already reviewed this request.');
      } else {
        setReviewMessage('Could not submit your review. Please try again.');
      }
    } finally {
      setSubmittingReview(false);
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

  const isOwner =
    principal !== null && principal.role === 'customer' && principal.id === request.customerId;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.category}>{request.category}</Text>
        <Text style={styles.status}>{request.status}</Text>
      </View>

      <Text style={styles.label}>Description</Text>
      <Text style={styles.value}>{request.description}</Text>

      <Text style={styles.label}>Location</Text>
      <Text style={styles.value}>
        {`${request.location.latitude}, ${request.location.longitude}`}
      </Text>

      <Text style={styles.label}>Requested</Text>
      <Text style={styles.value}>{new Date(request.createdAt).toLocaleString()}</Text>

      {!isOwner && (
        <>
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.value}>{customerName ?? request.customerId}</Text>
        </>
      )}

      {request.workerId !== undefined && (
        <>
          <Text style={styles.label}>Assigned worker</Text>
          <Text style={styles.value}>{workerName ?? request.workerId}</Text>
        </>
      )}

      {isOwner && customerCanCancel(request.status) && (
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

      {isOwner && request.status === 'completed' && (
        <View style={styles.reviewBox}>
          <Text style={styles.reviewHeading}>Rate the worker</Text>
          {!reviewDone && (
            <>
              <View style={styles.ratingRow}>
                {RATINGS.map((value) => {
                  const selected = rating !== null && value <= rating;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setRating(value);
                      }}
                      disabled={submittingReview}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${String(value)}`}
                    >
                      <Text style={[styles.star, selected && styles.starSelected]}>★</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Add a comment (optional)"
                accessibilityLabel="Review comment"
                editable={!submittingReview}
                multiline
              />
              <Pressable
                style={({ pressed }) => [
                  styles.submit,
                  (pressed || submittingReview || rating === null) && styles.submitDisabled,
                ]}
                onPress={() => {
                  void submitReview();
                }}
                disabled={submittingReview || rating === null}
                accessibilityRole="button"
                accessibilityLabel="Submit review"
              >
                {submittingReview ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>Submit review</Text>
                )}
              </Pressable>
            </>
          )}
          {reviewMessage !== null && <Text style={styles.reviewMessage}>{reviewMessage}</Text>}
        </View>
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
  reviewBox: { marginTop: 32, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 20 },
  reviewHeading: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  ratingRow: { flexDirection: 'row', gap: 6 },
  star: { fontSize: 32, color: '#cbd5e1' },
  starSelected: { color: '#f59e0b' },
  commentInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    marginTop: 12,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitDisabled: { backgroundColor: '#93c5fd' },
  submitText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  reviewMessage: { marginTop: 12, fontSize: 14, color: '#0f172a' },
});
