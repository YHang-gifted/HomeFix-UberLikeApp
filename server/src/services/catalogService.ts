import type { CatalogItem } from '../../../shared/schemas.ts';

/**
 * The fixed-price catalog — standardized, well-scoped tasks the platform prices up front (the
 * "price-first" track in `docs/pricing-model.md`). This is the **trusted source of truth** for a
 * fixed price: a customer books a catalog item by id and the server takes the price from here, so a
 * customer can never set their own fixed price.
 *
 * Held as a code constant for now (small, versioned, no admin UI yet). The prices are USD
 * ({@link PLATFORM_CURRENCY}) minor units and are **placeholders** — the real numbers are a
 * business decision (see `docs/fee-model.md` §7). Non-standard jobs stay on the quote track.
 */
export const FIXED_PRICE_CATALOG: readonly CatalogItem[] = [
  { id: 'drain-unclog', category: 'plumbing', title: 'Unclog a drain', priceCents: 12000 },
  {
    id: 'faucet-replace',
    category: 'plumbing',
    title: 'Replace a standard faucet',
    priceCents: 15000,
  },
  { id: 'toilet-replace', category: 'plumbing', title: 'Replace a toilet', priceCents: 28000 },
  {
    id: 'light-fixture-replace',
    category: 'electrical',
    title: 'Replace a light fixture',
    priceCents: 13000,
  },
  {
    id: 'ceiling-fan-install',
    category: 'electrical',
    title: 'Install a ceiling fan',
    priceCents: 18000,
  },
  {
    id: 'outlet-replace',
    category: 'electrical',
    title: 'Replace an outlet or switch',
    priceCents: 9000,
  },
  {
    id: 'home-clean-standard',
    category: 'cleaning',
    title: 'Standard home cleaning (2 hours)',
    priceCents: 10000,
  },
  {
    id: 'dishwasher-install',
    category: 'appliance',
    title: 'Install a dishwasher',
    priceCents: 20000,
  },
  { id: 'tv-wall-mount', category: 'general', title: 'Mount a TV on the wall', priceCents: 9000 },
  {
    id: 'furniture-assembly',
    category: 'general',
    title: 'Assemble flat-pack furniture (per item)',
    priceCents: 6000,
  },
  // Not a job in itself: the way in for work that cannot be priced from photos. The worker attends,
  // assesses, and revises to the real total on site — so this fee is absorbed into the final price
  // rather than charged on top.
  {
    id: 'assessment-visit',
    category: 'general',
    title: 'On-site assessment visit',
    priceCents: 4900,
    assessment: true,
  },
];

/** The full fixed-price catalog (a copy, so callers can't mutate the source). */
export function listCatalog(): CatalogItem[] {
  return [...FIXED_PRICE_CATALOG];
}

/** A catalog item by its id, or undefined if there is no such item. */
export function getCatalogItem(id: string): CatalogItem | undefined {
  return FIXED_PRICE_CATALOG.find((item) => item.id === id);
}
