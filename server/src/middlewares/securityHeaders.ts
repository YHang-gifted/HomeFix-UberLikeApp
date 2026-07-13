import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Response headers that stop a URL — or the page at it — from leaking.
 *
 * The one that earns its place today is **`Referrer-Policy: no-referrer`**, and it is a
 * prerequisite for the password-reset link, not a nicety. That link carries the plaintext
 * reset token in its query string (`/?reset=<token>`), so the moment the page it opens
 * requests anything from a third party — and the web app loads the Google Maps JS SDK — the
 * browser would attach the **full URL, token included**, as the `Referer` header. The secret
 * we so carefully keep out of our own logs would be handed to someone else's.
 *
 * `no-referrer` sends no `Referer` at all, ever. We have no analytics or affiliate flow that
 * depends on one, so there is nothing to trade away.
 *
 * The other two are cheap and uncontroversial: `X-Content-Type-Options: nosniff` stops a
 * browser from second-guessing a declared content type, and `X-Frame-Options: DENY` stops the
 * app being framed for clickjacking (there is no legitimate reason to embed it).
 *
 * Applied to every response, API and web app alike — the token can appear in a URL on either.
 */
export function createSecurityHeaders(): RequestHandler {
  return function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  };
}
