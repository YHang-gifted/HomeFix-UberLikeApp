import { existsSync } from 'node:fs';
import { join } from 'node:path';

import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** True when a directory looks like a built web bundle (it has an index.html). */
export function isBuiltWebDir(distDir: string): boolean {
  return existsSync(join(distDir, 'index.html'));
}

/**
 * Middleware that serves a built single-page web app (the Expo web export)
 * same-origin with the API: real static assets are served first, then an SPA
 * fallback returns `index.html` for browser navigations so client-side routes
 * work on refresh and deep-links.
 *
 * Mounted after the API routers, it never shadows the API: the fallback only
 * answers GET requests whose `Accept` explicitly includes `text/html` (browser
 * navigations), so API/XHR calls — which send `application/json` or `* / *` —
 * fall through to the normal 404 as before.
 */
export function createWebAppHandlers(distDir: string): RequestHandler[] {
  const indexHtml = join(distDir, 'index.html');
  const serveStatic = express.static(distDir, { index: false });

  function spaFallback(req: Request, res: Response, next: NextFunction): void {
    const accept = req.headers.accept ?? '';
    if (req.method !== 'GET' || !accept.includes('text/html')) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  }

  return [serveStatic, spaFallback];
}
