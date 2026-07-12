/**
 * Parse a user-entered LOCAL visit time into the ISO-8601 UTC string the API expects
 * (`scheduledAt` is validated as a strict ISO datetime server-side).
 *
 * Accepts `YYYY-MM-DD HH:MM` (24-hour), with `T` allowed in place of the space. We build the
 * Date from its parts rather than handing the string to `new Date(...)`, because parsing a
 * bare `"2026-07-20 10:00"` is not specified — engines disagree, and Hermes (React Native)
 * is not the same as V8. Constructing from parts is unambiguous local time everywhere.
 *
 * Returns null when the input is malformed or not a real calendar time (e.g. `2026-02-31`),
 * so the caller can show a validation error instead of sending a bad request.
 */
export function parseLocalDateTime(input: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(input.trim());
  if (match === null) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hour, minute);
  // Reject values that rolled over (2026-02-31 → March 3) or that aren't a valid date.
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date.toISOString();
}

/** True when the ISO time is still ahead of now — the server rejects past times (422). */
export function isFuture(iso: string): boolean {
  return Date.parse(iso) > Date.now();
}
