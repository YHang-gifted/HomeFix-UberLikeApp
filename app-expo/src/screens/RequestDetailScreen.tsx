import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { customerCanCancel } from '../../../app/src/features/serviceRequests/customerStatus';
import {
  centsToDollars,
  dollarsToCents,
  formatCents,
} from '../../../app/src/features/payments/paymentFormat';
import { hasPlatformFee, paymentSplit } from '../../../app/src/features/payments/paymentSplit';
import type { OpenCheckout } from '../../../app/src/features/payments/checkout';
import type { ConfirmCardAction } from '../../../app/src/features/payments/cardAction';
import { mapsUrl } from '../../../app/src/features/location/mapsLink';
import { staticMapPreviewUrl } from '../staticMap';
import { deriveQuoteView } from '../../../app/src/features/quotes/quoteView';
import { deriveScheduleView } from '../../../app/src/features/schedule/scheduleView';
import { isFuture } from '../../../app/src/features/schedule/scheduleFormat';
import type { OpenDateTimePicker } from '../../../app/src/features/schedule/dateTimePicker';
import type {
  AuditEvent,
  Coordinates,
  Payment,
  PaymentMethod,
  Quote,
  Receipt,
  RefundRequest,
  Review,
  SavedCard,
  ServiceRequest,
} from '../../../shared/schemas';
import { apiClient } from '../api';
import { DateTimeField } from '../components/DateTimeField';
import { StatusBadge } from '../components/StatusBadge';
import { colors, radii, shadow, spacing } from '../theme';

const RATINGS = [1, 2, 3, 4, 5];

/** "Visa" from Stripe's lowercase brand code; leaves unknown brands as-is. */
function brandLabel(brand: string): string {
  return brand.length === 0 ? 'Card' : brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** A customer-facing sentence for a refund request's status. */
function refundStatusLabel(status: RefundRequest['status']): string {
  switch (status) {
    case 'open':
      return 'Refund requested — awaiting review.';
    case 'approved':
      return 'Refund request approved — your payment was refunded.';
    case 'rejected':
      return 'Refund request declined.';
    case 'withdrawn':
      return 'Refund request withdrawn.';
  }
}

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
  /** Called after the assigned worker releases the job back to the pool. */
  onReleased?: () => void;
  /** Called after an admin resets the request back to the pool for reassignment. */
  onReset?: () => void;
  /** Called when the user opens the request's message thread. */
  onViewMessages?: () => void;
  /**
   * Opens the provider's hosted checkout page (Stripe). When provided and the
   * created payment carries a `checkoutUrl`, "Pay now" redirects the customer there
   * instead of using the mock `/pay`. Injected for tests/web; wired in App.tsx.
   */
  openCheckout?: OpenCheckout;
  /**
   * Completes a saved-card payment that needs SCA (3-D Secure), given the client secret from
   * `paySavedCard`'s `requires_action` result. Injected for tests/web; wired in App.tsx from the
   * native Stripe SDK. When absent, a card needing SCA falls back to "Pay another way".
   */
  confirmCardAction?: ConfirmCardAction;
  /**
   * Builds a static map thumbnail URL for the location, or null when none is
   * configured (no API key). Injected for tests; defaults to the real Google Static
   * Maps preview from config.
   */
  mapPreviewUrl?: (location: Coordinates) => string | null;
  /**
   * Whether to offer PayPal as a payment method. Defaults from
   * `EXPO_PUBLIC_PAYPAL_ENABLED` — the operator sets it when PayPal is configured on the
   * server. When false, only the default card provider is used (no method picker).
   */
  paypalEnabled?: boolean;
  /**
   * Opens the platform date/time picker for proposing a visit time. App.tsx injects the real
   * one; tests pass a fake. Left undefined the propose field is hidden.
   */
  openDateTimePicker?: OpenDateTimePicker;
}

export function RequestDetailScreen({
  requestId,
  client,
  onCancelled,
  onReleased,
  onReset,
  onViewMessages,
  openCheckout,
  confirmCardAction,
  mapPreviewUrl = staticMapPreviewUrl,
  paypalEnabled = process.env.EXPO_PUBLIC_PAYPAL_ENABLED === 'true',
  openDateTimePicker,
}: RequestDetailScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);
  const principal = useMemo(() => activeClient.getPrincipal(), [activeClient]);

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [adminCancelling, setAdminCancelling] = useState(false);
  const [adminCancelReason, setAdminCancelReason] = useState('');
  const [adminCancelError, setAdminCancelError] = useState<string | null>(null);

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
  const [workerBio, setWorkerBio] = useState<string | null>(null);
  const [workerSkills, setWorkerSkills] = useState<string[]>([]);
  const [workerPhone, setWorkerPhone] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [refundRequest, setRefundRequest] = useState<RefundRequest | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
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
              setWorkerBio(worker.bio ?? null);
              setWorkerSkills(worker.skills ?? []);
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
        // The owning customer's saved cards, for tap-to-pay. Best-effort: a non-customer 403s and
        // an unconfigured Stripe returns [], either of which just hides the saved-card option.
        if (principal?.role === 'customer') {
          try {
            const cards = await activeClient.listPaymentMethods();
            if (active) {
              setSavedCards(cards);
            }
          } catch {
            // Leave the saved-card option hidden.
          }
          // Any existing refund request on this payment (404 when none).
          try {
            const rr = await activeClient.getRefundRequest(requestId);
            if (active) {
              setRefundRequest(rr);
            }
          } catch {
            // No refund request yet.
          }
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

  async function releaseJob(): Promise<void> {
    setReleasing(true);
    setReleaseError(null);
    try {
      await activeClient.releaseRequest(requestId);
      onReleased?.();
    } catch (releaseFailure) {
      setReleaseError(
        isApiError(releaseFailure)
          ? releaseFailure.message
          : 'Could not release the job. Please try again.',
      );
      setReleasing(false);
    }
  }

  /** Put a time on the table. The picker only yields future times, but re-check before sending. */
  async function proposeVisit(): Promise<void> {
    if (scheduleAt === null) {
      setScheduleError('Choose a date and time first.');
      return;
    }
    const iso = scheduleAt.toISOString();
    if (!isFuture(iso)) {
      setScheduleError('Choose a time in the future.');
      return;
    }
    setScheduling(true);
    setScheduleError(null);
    try {
      setRequest(await activeClient.proposeSchedule(requestId, iso));
      setScheduleAt(null);
    } catch (failure) {
      setScheduleError(
        isApiError(failure) ? failure.message : 'Could not propose that time. Please try again.',
      );
    } finally {
      setScheduling(false);
    }
  }

  /** Accept the time the other party proposed. */
  async function confirmVisit(): Promise<void> {
    setScheduling(true);
    setScheduleError(null);
    try {
      setRequest(await activeClient.confirmSchedule(requestId));
    } catch (failure) {
      setScheduleError(
        isApiError(failure) ? failure.message : 'Could not confirm the time. Please try again.',
      );
    } finally {
      setScheduling(false);
    }
  }

  async function resetJob(): Promise<void> {
    setResetting(true);
    setResetError(null);
    try {
      await activeClient.resetRequest(requestId);
      onReset?.();
    } catch (resetFailure) {
      setResetError(
        isApiError(resetFailure)
          ? resetFailure.message
          : 'Could not reset the request. Please try again.',
      );
      setResetting(false);
    }
  }

  async function adminCancelAndRefund(): Promise<void> {
    setAdminCancelling(true);
    setAdminCancelError(null);
    const trimmedReason = adminCancelReason.trim();
    try {
      await activeClient.adminCancelWithRefund(
        requestId,
        trimmedReason.length > 0 ? trimmedReason : undefined,
      );
      onCancelled?.();
    } catch (adminCancelFailure) {
      setAdminCancelError(
        isApiError(adminCancelFailure)
          ? adminCancelFailure.message
          : 'Could not cancel and refund. Please try again.',
      );
      setAdminCancelling(false);
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
      // Default (card) keeps the two-arg call; only send an explicit method for PayPal.
      const created =
        paymentMethod === 'card'
          ? await activeClient.createPayment(requestId, amountCents)
          : await activeClient.createPayment(requestId, amountCents, paymentMethod);
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
    setPaymentNotice(null);
    setPaymentBusy(true);
    try {
      if (payment?.provider === 'stripe' && openCheckout !== undefined) {
        // Open a FRESH hosted-checkout session every time (slice 192). The URL from
        // create-payment is not reused — a Checkout Session expires, so after any delay it is
        // dead; `startCheckout` mints a new one on demand. Nothing here marks the payment paid —
        // it is settled by the verified webhook; the customer returns and refreshes.
        const { checkoutUrl } = await activeClient.startCheckout(requestId);
        await openCheckout(checkoutUrl);
        setPaymentNotice('Complete the payment in the page that opened, then return and refresh.');
      } else if (payment?.checkoutUrl !== undefined && openCheckout !== undefined) {
        // Any other external-checkout provider that handed back a URL on create.
        await openCheckout(payment.checkoutUrl);
        setPaymentNotice('Complete the payment in the page that opened, then return and refresh.');
      } else if (payment?.provider === 'paypal') {
        // Back from PayPal approval (no checkout URL left): capture to settle.
        setPayment(await activeClient.capturePaypalPayment(requestId));
      } else {
        // Mock provider (dev/test): the server marks it paid directly.
        setPayment(await activeClient.payPayment(requestId));
      }
    } catch (payError) {
      setPaymentError(isApiError(payError) ? payError.message : 'Could not open the payment page.');
    } finally {
      setPaymentBusy(false);
    }
  }

  async function paySavedCardNow(paymentMethodId: string): Promise<void> {
    setPaymentError(null);
    setPaymentNotice(null);
    setPaymentBusy(true);
    try {
      const result = await activeClient.paySavedCard(requestId, paymentMethodId);
      if (result.status === 'requires_action') {
        if (result.clientSecret === undefined || confirmCardAction === undefined) {
          // The card needs 3-D Secure but we can't drive it here (e.g. web) — send them to the
          // hosted checkout instead, which handles the challenge itself.
          setPaymentNotice('This card needs extra verification. Please use “Pay another way”.');
        } else {
          await confirmCardAction(result.clientSecret);
          setPaymentNotice(
            'Card verified. Your payment will show as paid once confirmed — refresh in a moment.',
          );
        }
      } else {
        setPaymentNotice(
          'Payment sent. It will show as paid once confirmed — refresh in a moment.',
        );
      }
      // Reflect any immediate change (usually still pending until the webhook settles).
      try {
        setPayment(await activeClient.getPayment(requestId));
      } catch {
        // Best-effort refresh; the notice already tells the customer what to expect.
      }
    } catch (payError) {
      setPaymentError(isApiError(payError) ? payError.message : 'Could not complete the payment.');
    } finally {
      setPaymentBusy(false);
    }
  }

  async function requestRefundNow(): Promise<void> {
    const reason = refundReason.trim();
    if (reason === '') {
      setRefundError('Please say why you want a refund.');
      return;
    }
    setRefundError(null);
    setRefundBusy(true);
    try {
      const created = await activeClient.requestRefund(requestId, reason);
      setRefundRequest(created);
      setRefundReason('');
    } catch (refundReqError) {
      setRefundError(
        isApiError(refundReqError) ? refundReqError.message : 'Could not request a refund.',
      );
    } finally {
      setRefundBusy(false);
    }
  }

  async function refundNow(): Promise<void> {
    setPaymentError(null);
    setPaymentBusy(true);
    try {
      const refunded = await activeClient.refundPayment(requestId);
      setPayment(refunded);
    } catch (refundError) {
      setPaymentError(
        isApiError(refundError) ? refundError.message : 'Could not refund the payment.',
      );
    } finally {
      setPaymentBusy(false);
    }
  }

  async function viewReceipt(): Promise<void> {
    setReceiptError(null);
    setReceiptBusy(true);
    try {
      setReceipt(await activeClient.getPaymentReceipt(requestId));
    } catch (receiptFailure) {
      setReceiptError(
        isApiError(receiptFailure) ? receiptFailure.message : 'Could not load the receipt.',
      );
    } finally {
      setReceiptBusy(false);
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
  const isAdmin = principal !== null && principal.role === 'admin';
  const isActiveAssignment =
    request.workerId !== undefined &&
    (request.status === 'matched' ||
      request.status === 'accepted' ||
      request.status === 'in_progress');

  const quoteView = deriveQuoteView({ principal, request, quote });
  const scheduleView = deriveScheduleView({ principal, request });
  const locationPreview = mapPreviewUrl(request.location);
  const paymentAmountValue =
    amountText !== ''
      ? amountText
      : quoteView.prefillAmountCents !== null
        ? centsToDollars(quoteView.prefillAmountCents)
        : '';
  // Label the pay action by provider: a PayPal payment redirects to approve (while a
  // checkout URL is present), then captures on return; everything else is "Pay now".
  const payActionLabel =
    payment?.provider === 'paypal'
      ? payment.checkoutUrl !== undefined
        ? 'Pay with PayPal'
        : 'Complete PayPal payment'
      : 'Pay now';
  // Saved-card tap-to-pay is offered for a pending card payment (not PayPal) when the customer has
  // at least one card on file. When shown, the existing button becomes the "pay another way"
  // (hosted checkout) alternative.
  const showSavedCards =
    isOwner &&
    payment !== null &&
    payment.status === 'pending' &&
    payment.provider !== 'paypal' &&
    savedCards.length > 0;
  const primaryPayLabel = showSavedCards ? 'Pay another way' : payActionLabel;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>SERVICE REQUEST</Text>
          <Text style={styles.category}>{request.category}</Text>
        </View>
        <StatusBadge status={request.status} />
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
        {request.address ??
          `${String(request.location.latitude)}, ${String(request.location.longitude)}`}
      </Text>
      {locationPreview !== null && (
        <Pressable
          onPress={() => {
            void Linking.openURL(mapsUrl(request.location));
          }}
          accessibilityRole="button"
          accessibilityLabel="Open map"
        >
          <Image
            source={{ uri: locationPreview }}
            style={styles.mapPreview}
            resizeMode="cover"
            accessibilityLabel="Map preview"
          />
        </Pressable>
      )}
      <Pressable
        onPress={() => {
          void Linking.openURL(mapsUrl(request.location));
        }}
        accessibilityRole="button"
        accessibilityLabel="Open in Maps"
      >
        <Text style={styles.mapLink}>Open in Maps</Text>
      </Pressable>

      <Text style={styles.label}>Requested</Text>
      <Text style={styles.value}>{new Date(request.createdAt).toLocaleString()}</Text>

      {scheduleView.visible && (
        <View style={styles.schedule} accessibilityLabel="Visit time">
          <Text style={styles.label}>Visit time</Text>
          <Text style={styles.value}>{scheduleView.summary}</Text>

          {scheduleView.canConfirm && (
            <Pressable
              style={({ pressed }) => [
                styles.confirmVisitButton,
                pressed && styles.confirmVisitButtonPressed,
              ]}
              onPress={() => {
                void confirmVisit();
              }}
              disabled={scheduling}
              accessibilityRole="button"
              accessibilityLabel="Confirm this time"
            >
              <Text style={styles.confirmVisitButtonText}>Confirm this time</Text>
            </Pressable>
          )}

          {scheduleView.canPropose && openDateTimePicker !== undefined && (
            <>
              <DateTimeField
                value={scheduleAt}
                onChange={setScheduleAt}
                open={openDateTimePicker}
                minimumDate={new Date()}
                accessibilityLabel="Proposed visit time"
                placeholder="Choose a date & time"
              />
              <Pressable
                style={({ pressed }) => [
                  styles.proposeVisitButton,
                  pressed && styles.proposeVisitButtonPressed,
                ]}
                onPress={() => {
                  void proposeVisit();
                }}
                disabled={scheduling}
                accessibilityRole="button"
                accessibilityLabel={scheduleView.proposeLabel}
              >
                <Text style={styles.proposeVisitButtonText}>{scheduleView.proposeLabel}</Text>
              </Pressable>
            </>
          )}

          {scheduleError !== null && <Text style={styles.error}>{scheduleError}</Text>}
        </View>
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
          {workerBio !== null && <Text style={styles.value}>{workerBio}</Text>}
          {workerSkills.length > 0 && (
            <Text style={styles.value}>Specialties: {workerSkills.join(', ')}</Text>
          )}
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
                placeholder="Amount in USD (e.g. 2500)"
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
            <>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentAmount}>{formatCents(payment.amountCents)}</Text>
                <Text
                  style={
                    payment.status === 'paid'
                      ? styles.paymentPaid
                      : payment.status === 'refunded'
                        ? styles.paymentRefunded
                        : styles.paymentPending
                  }
                >
                  {payment.status === 'paid'
                    ? 'Paid'
                    : payment.status === 'refunded'
                      ? 'Refunded'
                      : 'Pending'}
                </Text>
              </View>
              {hasPlatformFee(payment) && (
                <Text style={styles.paymentSplit}>
                  {`Worker net ${formatCents(paymentSplit(payment).workerNetCents)} · Platform fee ${formatCents(paymentSplit(payment).platformFeeCents)}`}
                </Text>
              )}
              {isAdmin && payment.status === 'paid' && (
                <Pressable
                  style={({ pressed }) => [styles.refundButton, pressed && styles.refundPressed]}
                  onPress={() => {
                    void refundNow();
                  }}
                  disabled={paymentBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Refund payment"
                >
                  {paymentBusy ? (
                    <ActivityIndicator color="#dc2626" />
                  ) : (
                    <Text style={styles.refundText}>Refund payment</Text>
                  )}
                </Pressable>
              )}

              {isOwner && (refundRequest !== null || payment.status === 'paid') && (
                <View style={styles.refundReqBox}>
                  {refundRequest !== null ? (
                    <>
                      <Text style={styles.refundReqStatus}>
                        {refundStatusLabel(refundRequest.status)}
                      </Text>
                      <Text style={styles.refundReqReason}>“{refundRequest.reason}”</Text>
                      {refundRequest.resolutionNote !== undefined && (
                        <Text style={styles.refundReqNote}>{refundRequest.resolutionNote}</Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={styles.refundReqLabel}>Not right? Request a refund.</Text>
                      <TextInput
                        style={styles.reasonInput}
                        value={refundReason}
                        onChangeText={setRefundReason}
                        placeholder="Why are you requesting a refund?"
                        accessibilityLabel="Refund reason"
                        editable={!refundBusy}
                        multiline
                      />
                      <Pressable
                        style={({ pressed }) => [
                          styles.refundButton,
                          pressed && styles.refundPressed,
                        ]}
                        onPress={() => {
                          void requestRefundNow();
                        }}
                        disabled={refundBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Request refund"
                      >
                        {refundBusy ? (
                          <ActivityIndicator color="#dc2626" />
                        ) : (
                          <Text style={styles.refundText}>Request a refund</Text>
                        )}
                      </Pressable>
                      {refundError !== null && <Text style={styles.error}>{refundError}</Text>}
                    </>
                  )}
                </View>
              )}

              {payment.status === 'paid' && receipt === null && (
                <Pressable
                  style={({ pressed }) => [styles.receiptButton, pressed && styles.receiptPressed]}
                  onPress={() => {
                    void viewReceipt();
                  }}
                  disabled={receiptBusy}
                  accessibilityRole="button"
                  accessibilityLabel="View receipt"
                >
                  {receiptBusy ? (
                    <ActivityIndicator color={colors.brand} />
                  ) : (
                    <Text style={styles.receiptButtonText}>View receipt</Text>
                  )}
                </Pressable>
              )}

              {receipt !== null && (
                <View style={styles.receiptCard}>
                  <View style={styles.receiptHeader}>
                    <Text style={styles.receiptTitle}>Receipt</Text>
                    <Text style={styles.receiptNumber}>{receipt.receiptNumber}</Text>
                  </View>
                  <Text style={styles.receiptMeta}>
                    Issued {new Date(receipt.issuedAt).toLocaleString()}
                  </Text>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptRowLabel}>Amount paid</Text>
                    <Text style={styles.receiptRowValue}>{formatCents(receipt.amountCents)}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptRowLabel}>Platform fee</Text>
                    <Text style={styles.receiptRowValue}>
                      {formatCents(receipt.platformFeeCents)}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptRowLabel}>Worker net</Text>
                    <Text style={styles.receiptRowValue}>
                      {formatCents(receipt.workerNetCents)}
                    </Text>
                  </View>
                  <Text style={styles.receiptParties}>
                    {`${receipt.customerName} → ${receipt.workerName} · ${receipt.category}`}
                  </Text>
                </View>
              )}

              {receiptError !== null && <Text style={styles.error}>{receiptError}</Text>}
            </>
          )}

          {isOwner && payment === null && (
            <>
              {paypalEnabled && (
                <View style={styles.methodRow}>
                  {(['card', 'paypal'] as const).map((method) => {
                    const selected = paymentMethod === method;
                    return (
                      <Pressable
                        key={method}
                        style={[styles.methodChip, selected && styles.methodChipSelected]}
                        onPress={() => {
                          setPaymentMethod(method);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          method === 'card' ? 'Card payment method' : 'PayPal payment method'
                        }
                      >
                        <Text
                          style={[styles.methodChipText, selected && styles.methodChipTextSelected]}
                        >
                          {method === 'card' ? 'Card' : 'PayPal'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <TextInput
                style={styles.paymentInput}
                value={paymentAmountValue}
                onChangeText={setAmountText}
                placeholder="Amount in USD (e.g. 1500)"
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

          {showSavedCards && (
            <View style={styles.savedCards}>
              <Text style={styles.savedCardsLabel}>Pay with a saved card</Text>
              {savedCards.map((card) => (
                <Pressable
                  key={card.id}
                  style={({ pressed }) => [
                    styles.savedCardRow,
                    pressed && styles.savedCardRowPressed,
                  ]}
                  onPress={() => {
                    void paySavedCardNow(card.id);
                  }}
                  disabled={paymentBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`Pay with ${brandLabel(card.brand)} ending ${card.last4}`}
                >
                  <Text style={styles.savedCardText}>
                    {brandLabel(card.brand)} •••• {card.last4}
                  </Text>
                  <Text style={styles.savedCardPay}>Pay</Text>
                </Pressable>
              ))}
            </View>
          )}

          {isOwner && payment !== null && payment.status === 'pending' && (
            <Pressable
              style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
              onPress={() => {
                void payNow();
              }}
              disabled={paymentBusy}
              accessibilityRole="button"
              accessibilityLabel={primaryPayLabel}
            >
              {paymentBusy ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.payButtonText}>{primaryPayLabel}</Text>
              )}
            </Pressable>
          )}

          {paymentNotice !== null && <Text style={styles.paymentNotice}>{paymentNotice}</Text>}
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

      {isOwner && customerCanCancel(request.status) && payment?.status !== 'paid' && (
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

      {isAssignedWorker &&
        (request.status === 'matched' ||
          request.status === 'accepted' ||
          request.status === 'in_progress') && (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.cancel,
                (pressed || releasing) && styles.cancelPressed,
              ]}
              onPress={() => {
                void releaseJob();
              }}
              disabled={releasing}
              accessibilityRole="button"
              accessibilityLabel="Release job"
            >
              {releasing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.cancelText}>Release job</Text>
              )}
            </Pressable>
            {releaseError !== null && <Text style={styles.error}>{releaseError}</Text>}
          </>
        )}

      {isAdmin && isActiveAssignment && (
        <>
          <Pressable
            style={({ pressed }) => [styles.cancel, (pressed || resetting) && styles.cancelPressed]}
            onPress={() => {
              void resetJob();
            }}
            disabled={resetting}
            accessibilityRole="button"
            accessibilityLabel="Reset assignment"
          >
            {resetting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.cancelText}>Reset assignment</Text>
            )}
          </Pressable>
          {resetError !== null && <Text style={styles.error}>{resetError}</Text>}
        </>
      )}

      {isAdmin &&
        payment?.status === 'paid' &&
        request.status !== 'completed' &&
        request.status !== 'cancelled' && (
          <View style={styles.adminCancelBox}>
            <Text style={styles.label}>Cancel &amp; refund</Text>
            <Text style={styles.adminCancelHint}>
              Refunds the customer, reverses the worker&apos;s pending payout, and cancels the job.
            </Text>
            <TextInput
              style={styles.reasonInput}
              value={adminCancelReason}
              onChangeText={setAdminCancelReason}
              placeholder="Reason (optional)"
              accessibilityLabel="Admin cancellation reason"
              editable={!adminCancelling}
              multiline
            />
            <Pressable
              style={({ pressed }) => [
                styles.cancel,
                (pressed || adminCancelling) && styles.cancelPressed,
              ]}
              onPress={() => {
                void adminCancelAndRefund();
              }}
              disabled={adminCancelling}
              accessibilityRole="button"
              accessibilityLabel="Cancel job and refund"
            >
              {adminCancelling ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.cancelText}>Cancel job &amp; refund</Text>
              )}
            </Pressable>
            {adminCancelError !== null && <Text style={styles.error}>{adminCancelError}</Text>}
          </View>
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
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, width: '100%', maxWidth: 760, alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand },
  category: { fontSize: 24, fontWeight: '800', color: colors.ink, textTransform: 'capitalize' },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.inkMuted,
    marginTop: 20,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  value: { fontSize: 15, lineHeight: 22, color: colors.ink },
  mapPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.medium,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  mapLink: { fontSize: 14, fontWeight: '700', color: colors.brand, marginTop: 4 },
  workerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  favorite: { fontSize: 22, color: '#cbd5e1' },
  favoriteOn: { color: '#dc2626' },
  messages: {
    marginTop: 24,
    backgroundColor: colors.ink,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  messagesPressed: { backgroundColor: colors.brand },
  messagesText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  photoRow: { marginTop: 8 },
  photoRowContent: { gap: 8 },
  photo: {
    width: 120,
    height: 120,
    borderRadius: radii.medium,
    backgroundColor: colors.surfaceMuted,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  historyText: { fontSize: 14, color: colors.ink },
  historyTime: { fontSize: 12, color: colors.inkMuted },
  paymentBox: {
    marginTop: 16,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    ...shadow,
  },
  quoteBox: {
    marginTop: 16,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    ...shadow,
  },
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
  paymentAmount: { fontSize: 22, fontWeight: '800', color: colors.ink },
  paymentSplit: { fontSize: 13, color: colors.inkMuted, marginTop: 6 },
  paymentNotice: { fontSize: 14, color: colors.inkMuted, marginTop: 10, textAlign: 'center' },
  receiptButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  receiptPressed: { backgroundColor: colors.brandSoft },
  receiptButtonText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  receiptCard: {
    marginTop: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.canvas,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  receiptTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  receiptNumber: { fontSize: 12, fontWeight: '700', color: colors.inkMuted },
  receiptMeta: { fontSize: 12, color: colors.inkMuted, marginBottom: 10 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  receiptRowLabel: { fontSize: 14, color: colors.inkMuted },
  receiptRowValue: { fontSize: 14, fontWeight: '700', color: colors.ink },
  receiptParties: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 10,
    textTransform: 'capitalize',
  },
  paymentPending: { fontSize: 14, fontWeight: '600', color: '#d97706' },
  paymentPaid: { fontSize: 14, fontWeight: '600', color: '#16a34a' },
  paymentRefunded: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  refundButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#dc2626',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  refundPressed: { backgroundColor: '#fef2f2' },
  refundText: { color: '#dc2626', fontSize: 15, fontWeight: '600' },
  refundReqBox: { marginTop: 12, gap: 6 },
  refundReqLabel: { fontSize: 13, fontWeight: '700', color: colors.inkMuted },
  refundReqStatus: { fontSize: 14, fontWeight: '700', color: colors.ink },
  refundReqReason: { fontSize: 13, color: colors.inkMuted, fontStyle: 'italic' },
  refundReqNote: { fontSize: 13, color: colors.inkMuted },
  paymentInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  methodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingVertical: 10,
    alignItems: 'center',
  },
  methodChipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  methodChipText: { fontSize: 14, fontWeight: '700', color: colors.ink },
  methodChipTextSelected: { color: colors.white },
  schedule: {
    marginTop: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.canvas,
  },
  confirmVisitButton: {
    marginTop: 12,
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmVisitButtonPressed: { backgroundColor: colors.brandPressed },
  confirmVisitButtonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  proposeVisitButton: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  proposeVisitButtonPressed: { backgroundColor: colors.canvas },
  proposeVisitButtonText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  payButton: {
    marginTop: 12,
    backgroundColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  payButtonPressed: { backgroundColor: colors.brandPressed },
  payButtonText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  savedCards: { marginTop: 12, gap: spacing.sm },
  savedCardsLabel: { fontSize: 13, fontWeight: '700', color: colors.inkMuted },
  savedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  savedCardRowPressed: { backgroundColor: colors.brandSoft },
  savedCardText: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  savedCardPay: { color: colors.brand, fontSize: 15, fontWeight: '700' },
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
  adminCancelBox: { marginTop: 16 },
  adminCancelHint: { fontSize: 13, lineHeight: 18, color: '#64748b', marginTop: 4 },
  reviewBox: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    ...shadow,
  },
  reviewHeading: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 12 },
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
