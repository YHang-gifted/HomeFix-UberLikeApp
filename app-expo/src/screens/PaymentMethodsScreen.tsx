import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../../app/src/services/apiClient';
import { isApiError } from '../../../app/src/services/apiClient';
import type { OpenCheckout } from '../../../app/src/features/payments/checkout';
import type { SavedCard } from '../../../shared/schemas';
import { apiClient } from '../api';
import { colors, radii, shadow, spacing } from '../theme';

/** "Visa" from Stripe's lowercase brand code; leaves unknown brands as-is. */
function brandLabel(brand: string): string {
  if (brand.length === 0) {
    return 'Card';
  }
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

/** "•••• 4242 · Exp 09/2030" — the safe, glanceable summary of a saved card. */
function cardDetail(card: SavedCard): string {
  const month = String(card.expMonth).padStart(2, '0');
  return `•••• ${card.last4} · Exp ${month}/${card.expYear}`;
}

export interface PaymentMethodsScreenProps {
  /** Optional client override (used by tests). Defaults to the app singleton. */
  client?: ApiClient;
  /** Bump this to force a reload (e.g. when the screen regains focus after saving a card). */
  refreshToken?: number;
  /** Opens the hosted card-setup page. Injected; wired in App.tsx. */
  openCheckout?: OpenCheckout;
  /**
   * Whether to offer saving a card. Defaults from `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` — the
   * operator sets it when Stripe is configured, so the "Add a card" call to action only shows
   * when saving one can actually work.
   */
  savedCardsEnabled?: boolean;
}

export function PaymentMethodsScreen({
  client,
  refreshToken,
  openCheckout,
  savedCardsEnabled = (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '').length > 0,
}: PaymentMethodsScreenProps): ReactElement {
  const activeClient = useMemo(() => client ?? apiClient, [client]);

  const [cards, setCards] = useState<SavedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const found = await activeClient.listPaymentMethods();
        if (active) {
          setCards(found);
          setError(null);
        }
      } catch {
        if (active) {
          setError('Could not load your saved cards.');
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [activeClient, refreshToken]);

  async function addCard(): Promise<void> {
    setAddError(null);
    setAdding(true);
    try {
      // A fresh hosted setup session each time (it expires); saving completes on Stripe and the
      // new card appears on the next load when the screen regains focus.
      const { checkoutUrl } = await activeClient.startCardSetup();
      if (openCheckout !== undefined) {
        await openCheckout(checkoutUrl);
      }
    } catch (failure) {
      setAddError(isApiError(failure) ? failure.message : 'Could not start saving your card.');
    } finally {
      setAdding(false);
    }
  }

  function addButton(): ReactElement | null {
    if (!savedCardsEnabled) {
      return null;
    }
    return (
      <View style={styles.addBlock}>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          onPress={() => {
            void addCard();
          }}
          disabled={adding}
          accessibilityRole="button"
          accessibilityLabel="Add a card"
        >
          {adding ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Text style={styles.addButtonText}>+ Add a card</Text>
          )}
        </Pressable>
        {addError !== null && <Text style={styles.error}>{addError}</Text>}
      </View>
    );
  }

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (cards === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.emptyRoot}>
        {addButton()}
        <View style={styles.centered}>
          <Text style={styles.empty}>No saved cards yet.</Text>
          <Text style={styles.emptyHint}>
            Save a card to pay in a tap, then settle it on your monthly statement.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={cards}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={addButton()}
      renderItem={({ item }) => (
        <View
          style={styles.row}
          accessibilityLabel={`${brandLabel(item.brand)} ending ${item.last4}`}
        >
          <Text style={styles.brand}>{brandLabel(item.brand)}</Text>
          <Text style={styles.detail}>{cardDetail(item)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.canvas },
  listContent: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingVertical: spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyRoot: { flex: 1, backgroundColor: colors.canvas },
  error: { color: colors.danger, fontSize: 15, textAlign: 'center', marginTop: spacing.sm },
  empty: { color: colors.inkMuted, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyHint: {
    color: colors.inkMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
    lineHeight: 18,
  },
  addBlock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  addButton: {
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radii.medium,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  addButtonPressed: { backgroundColor: colors.brandSoft },
  addButtonText: { color: colors.brand, fontSize: 15, fontWeight: '700' },
  row: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    ...shadow,
  },
  brand: { fontSize: 16, fontWeight: '800', color: colors.ink },
  detail: { fontSize: 13, color: colors.inkMuted, marginTop: spacing.xs },
});
