/**
 * The visit-time picker's platform-agnostic pieces.
 *
 * Manual `YYYY-MM-DD HH:MM` entry was error-prone and, in the two-party schedule flow, both
 * sides had to type it. This replaces the typing with a real date/time picker — the OS calendar
 * on a phone, the browser's `datetime-local` on web. The picker always yields a valid `Date`,
 * so the string-parsing this used to need (`parseLocalDateTime`) is gone from that path; only
 * these small, pure helpers remain, and they are unit-tested.
 */

/**
 * Open a date/time picker seeded at `current`, not before `minimumDate`, and resolve with the
 * chosen `Date` — or `null` if the user cancels. Injected everywhere (the native module lives
 * behind it), so screens and tests never import it directly. The real ones are
 * `openDeviceDateTimePicker` (native / web); tests pass a fake.
 */
export type OpenDateTimePicker = (current: Date, minimumDate?: Date) => Promise<Date | null>;

const TWO = (n: number): string => String(n).padStart(2, '0');

/**
 * A chosen time as the value a web `<input type="datetime-local">` expects: `YYYY-MM-DDTHH:MM`
 * in **local** time. Built from the Date's local parts, never `toISOString()` (which is UTC and
 * would shift the displayed time by the timezone offset).
 */
export function toDateTimeLocalValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${TWO(date.getMonth() + 1)}-${TWO(
    date.getDate(),
  )}T${TWO(date.getHours())}:${TWO(date.getMinutes())}`;
}

/**
 * Parse a `<input type="datetime-local">` value (`YYYY-MM-DDTHH:MM`) back into a local `Date`,
 * or `null` if it is malformed or not a real calendar time. Built from parts for the same
 * reason as {@link toDateTimeLocalValue}: `new Date("2026-08-01T14:30")` is interpreted
 * inconsistently across engines.
 */
export function fromDateTimeLocalValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
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
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

/** How a chosen time reads on the button's face, e.g. "Fri, 1 Aug 2026, 14:30". */
export function formatVisitTime(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
