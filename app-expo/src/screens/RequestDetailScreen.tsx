import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import {
  centsToDollars,
  dollarsToCents,
  formatCents,
} from '../../../app/src/features/payments/paymentFormat';
import { deriveQuoteView } from '../../../app/src/features/quotes/quoteView';
import type { AuditEvent, Payment, Quote, Review, ServiceRequest } from '../../../shared/schemas';
import { apiClient } from '../api';

const RATINGS = [1, 2, 3, 4, 5];

function historyLabel(event: AuditEvent): string {
  if (event.action === 'service_request.created') {
    return 'Request created';
  }
  if (event.action === 'service_request.assigned') {
    const workerName = event.details?.['workerName'];
    return workerName !== undefined ? `Worker assigned: ${workerName}` : 'Worker assigned';
  }
  const to = event.details?.['to'];
  const reason = event.details?.['reason'];
  const base = to !== undefined ? `Status changed to ${to}` : 'Status changed';
  return reason !== undefined ? `${base} — ${reason}` : base;
}

export interface RequestDetailScreenProps {
  /** The request to display. */
  requestId: string;
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Called after the request is cancelled. */
  onCancelled?: () => void;
  /** Called when the user opens the request's message thread. */
  onViewMessages?: () => void;
}

export function RequestDetailScreen({
  requestId,
  client,
  onCancelled,
  onViewMessages,
}: RequestDetailScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);
  const principal = useMemo(() => activeClient.getPrincipal(), [activeClient]);

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyMessage, setReplyMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<AuditEvent[] | null>(null);
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [workerPhone, setWorkerPhone] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [amountText, setAmountText] = useState('');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteAmountText, setQuoteAmountText] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);

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
          if (principal?.role === 'customer') {
            try {
              // Seed the favorite toggle's state (customer-only on the server).
              const favorites = await activeClient.listFavorites();
              if (active) {
                setIsFavorite(favorites.some((worker) => worker.id === found.workerId));
              }
            } catch {
              // Favorites are best-effort; leave the toggle hidden.
            }
          }
        }
        try {
          // Contact phones are gated server-side to the request's parties.
          const contacts = await activeClient.getRequestContacts(requestId);
          if (active) {
            setCustomerPhone(contacts.customerPhone ?? null);
            setWorkerPhone(contacts.workerPhone ?? null);
          }
        } catch {
          // Contacts are best-effort; ignore failures.
        }
        try {
          const events = await activeClient.getRequestHistory(requestId);
          if (active) {
            setHistory(events);
          }
        } catch {
          // History is best-effort; ignore failures.
        }
        try {
          const found2 = await activeClient.getPayment(requestId);
          if (active) {
            setPayment(found2);
          }
        } catch {
          // No payment yet (404) or not a party; leave it unset.
        }
        try {
          const foundQuote = await activeClient.getQuote(requestId);
          if (active) {
            setQuote(foundQuote);
          }
        } catch {
          // No quote yet (404) or not a party; leave it unset.
        }
        try {
          const foundReview = await activeClient.getReview(requestId);
          if (active) {
            setReview(foundReview);
            setReplyText(foundReview.reply ?? '');
          }
        } catch {
          // No review yet (404) or not a party; leave it unset.
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
  }, [activeClient, requestId, principal]);

  async function cancel(): Promise<void> {
    setCancelling(true);
    const trimmedReason = cancelReason.trim();
    try {
      await activeClient.updateServiceRequestStatus(
        requestId,
        'cancelled',
        trimmedReason.length > 0 ? trimmedReason : undefined,
      );
      onCancelled?.();
    } catch {
      setError('Could not cancel the request. Please try again.');
      setCancelling(false);
    }
  }

  async function toggleFavorite(): Promise<void> {
    const workerId = request?.workerId;
    if (workerId === undefined) {
      return;
    }
    setFavoriteBusy(true);
    try {
      const favorites = isFavorite
        ? await activeClient.removeFavorite(workerId)
        : await activeClient.addFavorite(workerId);
      setIsFavorite(favorites.some((worker) => worker.id === workerId));
    } catch {
      // Best-effort: leave the toggle as-is on failure.
    } finally {
      setFavoriteBusy(false);
    }
  }

  async function setupPayment(): Promise<void> {
    // Fall back to an accepted quote's amount when the field is left untouched.
    const prefill = quote !== null && quote.status === 'accepted' ? quote.amountCents : null;
    const amountCents = amountText.trim() !== '' ? dollarsToCents(amountText) : prefill;
    if (amountCents === null) {
      setPaymentError('Enter a valid amount.');
      return;
    }
    setPaymentError(null);
    setPaymentBusy(true);
    try {
      const created = await activeClient.createPayment(requestId, amountCents);
      setPayment(created);
      setAmountText('');
    } catch (paymentSetupError) {
      setPaymentError(
        isApiError(paymentSetupError)
          ? paymentSetupError.message
          : 'Could not set up the payment. Please try again.',
      );
    } finally {
      setPaymentBusy(false);
    }
  }

  async function payNow(): Promise<void> {
    setPaymentError(null);
    setPaymentBusy(true);
    try {
      const paid = await activeClient.payPayment(requestId);
      setPayment(paid);
    } catch (payError) {
      setPaymentError(isApiError(payError) ? payError.message : 'Could not complete the payment.');
    } finally {
      setPaymentBusy(false);
    }
  }

  async function proposeQuote(): Promise<void> {
    const amountCents = dollarsToCents(quoteAmountText);
    if (amountCents === null) {
      setQuoteError('Enter a valid amount.');
      return;
    }
    setQuoteError(null);
    setQuoteBusy(true);
    const trimmedNote = quoteNote.trim();
    try {
      const created = await activeClient.createQuote(requestId, {
        amountCents,
        ...(trimmedNote.length > 0 ? { note: trimmedNote } : {}),
      });
      setQuote(created);
      setQuoteAmountText('');
      setQuoteNote('');
    } catch (proposeError) {
      setQuoteError(
        isApiError(proposeError)
          ? proposeError.message
          : 'Could not send the quote. Please try again.',
      );
    } finally {
      setQuoteBusy(false);
    }
  }

  async function respondToQuote(accept: boolean): Promise<void> {
    setQuoteError(null);
    setQuoteBusy(true);
    try {
      const updated = accept
        ? await activeClient.acceptQuote(requestId)
        : await activeClient.declineQuote(requestId);
      setQuote(updated);
    } catch (respondError) {
      setQuoteError(
        isApiError(respondError)
          ? respondError.message
          : 'Could not update the quote. Please try again.',
      );
    } finally {
      setQuoteBusy(false);
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
      const created = await activeClient.createReview(requestId, {
        rating,
        ...(trimmed.length > 0 ? { comment: trimmed } : {}),
      });
      setReview(created);
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

  async function submitReply(): Promise<void> {
    const trimmed = replyText.trim();
    if (trimmed === '') {
      return;
    }
    setReplyBusy(true);
    setReplyMessage(null);
    try {
      const updated = await activeClient.replyToReview(requestId, trimmed);
      setReview(updated);
      setReplyText(updated.reply ?? '');
      setReplyMessage('Reply posted.');
    } catch {
      setReplyMessage('Could not post your reply. Please try again.');
    } finally {
      setReplyBusy(false);
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
  const isAssignedWorker =
    principal !== null && principal.role === 'worker' && principal.id === request.workerId;

  const quoteView = deriveQuoteView({ principal, request, quote });
  const paymentAmountValue =
    amountText !== ''
      ? amountText
      : quoteView.prefillAmountCents !== null
        ? centsToDollars(quoteView.prefillAmountCents)
        : '';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.category}>{request.category}</Text>
        <Text style={styles.status}>{request.status}</Text>
      </View>

      <Text style={styles.label}>Description</Text>
      <Text style={styles.value}>{request.description}</Text>

      {request.photoUrls !== undefined && request.photoUrls.length > 0 && (
        <>
          <Text style={styles.label}>Photos</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoRow}
            contentContainerStyle={styles.photoRowContent}
          >
            {request.photoUrls.map((url) => (
              <Image
                key={url}
                source={{ uri: url }}
                style={styles.photo}
                accessibilityLabel="Request photo"
              />
            ))}
          </ScrollView>
        </>
      )}

      <Text style={styles.label}>Location</Text>
      <Text style={styles.value}>
        {`${request.location.latitude}, ${request.location.longitude}`}
      </Text>

      <Text style={styles.label}>Requested</Text>
      <Text style={styles.value}>{new Date(request.createdAt).toLocaleString()}</Text>

      {request.scheduledAt !== undefined && (
        <>
          <Text style={styles.label}>Preferred time</Text>
          <Text style={styles.value}>{new Date(request.scheduledAt).toLocaleString()}</Text>
        </>
      )}

      {!isOwner && (
        <>
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.value}>{customerName ?? request.customerId}</Text>
          {customerPhone !== null && <Text style={styles.value}>{customerPhone}</Text>}
        </>
      )}

      {request.workerId !== undefined && (
        <>
          <Text style={styles.label}>Assigned worker</Text>
          <View style={styles.workerRow}>
            <Text style={styles.value}>{workerName ?? request.workerId}</Text>
            {principal?.role === 'customer' && isFavorite !== null && (
              <Pressable
                onPress={() => {
                  void toggleFavorite();
                }}
                disabled={favoriteBusy}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Text style={[styles.favorite, isFavorite && styles.favoriteOn]}>
                  {isFavorite ? '♥' : '♡'}
                </Text>
              </Pressable>
            )}
          </View>
          {workerPhone !== null && <Text style={styles.value}>{workerPhone}</Text>}
        </>
      )}

      {request.workerId !== undefined && onViewMessages !== undefined && (
        <Pressable
          style={({ pressed }) => [styles.messages, pressed && styles.messagesPressed]}
          onPress={() => {
            onViewMessages();
          }}
          accessibilityRole="button"
          accessibilityLabel="Messages"
        >
          <Text style={styles.messagesText}>Messages</Text>
        </Pressable>
      )}

      {request.workerId !== undefined && (quote !== null || quoteView.canPropose) && (
        <View style={styles.quoteBox}>
          <Text style={styles.label}>Quote</Text>

          {quote !== null && (
            <>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentAmount}>{formatCents(quote.amountCents)}</Text>
                <Text
                  style={
                    quote.status === 'accepted'
                      ? styles.paymentPaid
                      : quote.status === 'declined'
                        ? styles.quoteDeclined
                        : styles.paymentPending
                  }
                >
                  {quoteView.statusLabel}
                </Text>
              </View>
              {quote.note !== undefined && <Text style={styles.value}>{quote.note}</Text>}
            </>
          )}

          {quoteView.canPropose && (
            <>
              <TextInput
                style={styles.paymentInput}
                value={quoteAmountText}
                onChangeText={setQuoteAmountText}
                placeholder="Amount in NT$ (e.g. 2500)"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Quote amount"
                editable={!quoteBusy}
              />
              <TextInput
                style={[styles.paymentInput, styles.quoteNoteInput]}
                value={quoteNote}
                onChangeText={setQuoteNote}
                placeholder="Note (optional)"
                accessibilityLabel="Quote note"
                editable={!quoteBusy}
                multiline
              />
              <Pressable
                style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
                onPress={() => {
                  void proposeQuote();
                }}
                disabled={quoteBusy}
                accessibilityRole="button"
                accessibilityLabel="Send quote"
              >
                {quoteBusy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.payButtonText}>Send quote</Text>
                )}
              </Pressable>
            </>
          )}

          {quoteView.canRespond && (
            <View style={styles.quoteActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.payButton,
                  styles.quoteAction,
                  pressed && styles.payButtonPressed,
                ]}
                onPress={() => {
                  void respondToQuote(true);
                }}
                disabled={quoteBusy}
                accessibilityRole="button"
                accessibilityLabel="Accept quote"
              >
                <Text style={styles.payButtonText}>Accept</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.cancel,
                  styles.quoteAction,
                  pressed && styles.cancelPressed,
                ]}
                onPress={() => {
                  void respondToQuote(false);
                }}
                disabled={quoteBusy}
                accessibilityRole="button"
                accessibilityLabel="Decline quote"
              >
                <Text style={styles.cancelText}>Decline</Text>
              </Pressable>
            </View>
          )}

          {quoteError !== null && <Text style={styles.error}>{quoteError}</Text>}
        </View>
      )}

      {request.workerId !== undefined && (payment !== null || isOwner) && (
        <View style={styles.paymentBox}>
          <Text style={styles.label}>Payment</Text>

          {payment !== null && (
            <View style={styles.paymentRow}>
              <Text style={styles.paymentAmount}>{formatCents(payment.amountCents)}</Text>
              <Text style={payment.status === 'paid' ? styles.paymentPaid : styles.paymentPending}>
                {payment.status === 'paid' ? 'Paid' : 'Pending'}
              </Text>
            </View>
          )}

          {isOwner && payment === null && (
            <>
              <TextInput
                style={styles.paymentInput}
                value={paymentAmountValue}
                onChangeText={setAmountText}
                placeholder="Amount in NT$ (e.g. 1500)"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Payment amount"
                editable={!paymentBusy}
              />
              <Pressable
                style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
                onPress={() => {
                  void setupPayment();
                }}
                disabled={paymentBusy}
                accessibilityRole="button"
                accessibilityLabel="Set up payment"
              >
                {paymentBusy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.payButtonText}>Set up payment</Text>
                )}
              </Pressable>
            </>
          )}

          {isOwner && payment !== null && payment.status === 'pending' && (
            <Pressable
              style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
              onPress={() => {
                void payNow();
              }}
              disabled={paymentBusy}
              accessibilityRole="button"
              accessibilityLabel="Pay now"
            >
              {paymentBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.payButtonText}>Pay now</Text>
              )}
            </Pressable>
          )}

          {paymentError !== null && <Text style={styles.error}>{paymentError}</Text>}
        </View>
      )}

      {history !== null && history.length > 0 && (
        <>
          <Text style={styles.label}>Activity</Text>
          {history.map((event) => (
            <View key={event.id} style={styles.historyRow}>
              <Text style={styles.historyText}>{historyLabel(event)}</Text>
              <Text style={styles.historyTime}>{new Date(event.occurredAt).toLocaleString()}</Text>
            </View>
          ))}
        </>
      )}

      {isOwner && customerCanCancel(request.status) && (
        <>
          <Text style={styles.label}>Cancellation reason</Text>
          <TextInput
            style={styles.reasonInput}
            value={cancelReason}
            onChangeText={setCancelReason}
            placeholder="Why are you cancelling? (optional)"
            accessibilityLabel="Cancellation reason"
            editable={!cancelling}
            multiline
          />
          <Pressable
            style={({ pressed }) => [
              styles.cancel,
              (pressed || cancelling) && styles.cancelPressed,
            ]}
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
        </>
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

      {review !== null && (
        <View style={styles.reviewBox}>
          <Text style={styles.reviewHeading}>Review</Text>
          <View style={styles.ratingRow}>
            {RATINGS.map((value) => (
              <Text
                key={value}
                style={[styles.star, value <= review.rating && styles.starSelected]}
              >
                ★
              </Text>
            ))}
          </View>
          {review.comment !== undefined && <Text style={styles.value}>{review.comment}</Text>}

          {review.reply !== undefined && (
            <>
              <Text style={styles.label}>Worker&apos;s reply</Text>
              <Text style={styles.value}>{review.reply}</Text>
            </>
          )}

          {isAssignedWorker && (
            <>
              <TextInput
                style={styles.commentInput}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Write a public reply"
                accessibilityLabel="Reply to review"
                editable={!replyBusy}
                multiline
              />
              <Pressable
                style={({ pressed }) => [
                  styles.submit,
                  (pressed || replyBusy || replyText.trim() === '') && styles.submitDisabled,
                ]}
                onPress={() => {
                  void submitReply();
                }}
                disabled={replyBusy || replyText.trim() === ''}
                accessibilityRole="button"
                accessibilityLabel={review.reply !== undefined ? 'Update reply' : 'Send reply'}
              >
                {replyBusy ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitText}>
                    {review.reply !== undefined ? 'Update reply' : 'Send reply'}
                  </Text>
                )}
              </Pressable>
              {replyMessage !== null && <Text style={styles.reviewMessage}>{replyMessage}</Text>}
            </>
          )}
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
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  favorite: { fontSize: 22, color: '#cbd5e1' },
  favoriteOn: { color: '#dc2626' },
  messages: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  messagesPressed: { backgroundColor: '#1d4ed8' },
  messagesText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  photoRow: { marginTop: 8 },
  photoRowContent: { gap: 8 },
  photo: { width: 120, height: 120, borderRadius: 8, backgroundColor: '#e2e8f0' },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  historyText: { fontSize: 14, color: '#0f172a' },
  historyTime: { fontSize: 12, color: '#94a3b8' },
  paymentBox: { marginTop: 8 },
  quoteBox: { marginTop: 8 },
  quoteDeclined: { fontSize: 14, fontWeight: '600', color: '#dc2626' },
  quoteNoteInput: { marginTop: 8, minHeight: 48, textAlignVertical: 'top' },
  quoteActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  quoteAction: { flex: 1, marginTop: 0 },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentAmount: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  paymentPending: { fontSize: 14, fontWeight: '600', color: '#d97706' },
  paymentPaid: { fontSize: 14, fontWeight: '600', color: '#16a34a' },
  paymentInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  payButton: {
    marginTop: 12,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  payButtonPressed: { backgroundColor: '#15803d' },
  payButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    marginTop: 4,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  cancel: {
    marginTop: 16,
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
