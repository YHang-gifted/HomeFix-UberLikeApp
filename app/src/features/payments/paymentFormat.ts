/**
 * Parse a user-entered TWD amount (in dollars, e.g. "1500" or "1500.50") into an
 * integer number of cents. Returns null when the input is not a positive amount,
 * so the caller can show a validation error instead of sending a bad request.
 */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '' || !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const cents = Math.round(Number(trimmed) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Render an integer number of cents as a plain dollar string for an input field,
 * e.g. 250000 → "2500", 150050 → "1500.5". Round-trips through `dollarsToCents`.
 * Used to prefill the payment amount from an accepted quote.
 */
export function centsToDollars(cents: number): string {
  return (cents / 100)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

/** Format an integer number of cents as a TWD amount string, e.g. "NT$1,500.00". */
export function formatCents(cents: number): string {
  const dollars = (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `NT$${dollars}`;
}
