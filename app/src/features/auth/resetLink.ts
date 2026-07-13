/**
 * The password-reset magic link: `https://<app>/?reset=<token>`.
 *
 * The server puts the token in the URL so the user never has to copy 64 hex characters out of
 * an email by hand. This module is the reading half — pure, so it is testable without a
 * browser — plus the rule for what to do with the URL afterwards.
 *
 * Nothing in the app read a query string before this (`?payouts=done` and `?payment=success`
 * have been configured at the providers for slices and were silently dropped), so this is the
 * first and, for now, only place that does.
 */

/** The query parameter carrying the reset token. Must match the server's `RESET_QUERY_PARAM`. */
export const RESET_QUERY_PARAM = 'reset';

/**
 * Read the reset token out of a URL query string (`?reset=…`, or the whole URL).
 *
 * Returns undefined for anything that isn't a non-empty token, so a stray `?reset=` cannot
 * push the UI into a reset flow with an empty code.
 */
export function readResetCode(search: string): string | undefined {
  const query = search.includes('?') ? search.slice(search.indexOf('?')) : search;
  const code = new URLSearchParams(query).get(RESET_QUERY_PARAM)?.trim();
  return code === undefined || code === '' ? undefined : code;
}

/**
 * The URL to replace the current one with, once the token has been read out of it.
 *
 * **The token must not linger in the address bar.** It is a live credential: left in place it
 * is written to the browser's history and session restore, it is what gets copied when someone
 * shares "the page I'm on", and it survives in the tab long after the reset is done. Reading
 * it is a one-shot act — take it, then rewrite the URL without it (`history.replaceState`, so
 * no new history entry is created and Back does not restore it).
 *
 * Every other query parameter is preserved; only `reset` is dropped.
 */
export function urlWithoutResetCode(href: string): string {
  const url = new URL(href);
  url.searchParams.delete(RESET_QUERY_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
