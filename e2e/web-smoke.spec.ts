import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';

/**
 * Does the built web app actually run in a browser?
 *
 * Nothing in CI has ever asked that. `npm test` exercises the API, jest exercises the
 * components in isolation, and the web build was only ever checked for having *produced*
 * files. A zod 3-vs-4 mismatch once made the exported bundle throw on boot and render a blank
 * white page — and it shipped that way for several slices, entirely green.
 *
 * The assertion that would have caught it is the first one here: **no uncaught exception, and
 * the login form is on the screen.** Everything else is a bonus.
 */

/**
 * Console noise we accept. Keep this list SHORT and justified — every entry is a thing we have
 * decided not to look at again. A `console.error` from the app itself is a finding, not noise.
 */
const ALLOWED_CONSOLE = [
  /favicon/i, // no favicon is shipped; the browser asks anyway.
  /Download the React DevTools/i, // React's own development banner.
];

/** Collect the two signals that mean "the page is broken", not merely "the page is chatty". */
function watchForFailures(page: Page): { errors: string[]; crashes: string[] } {
  const errors: string[] = [];
  const crashes: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (!ALLOWED_CONSOLE.some((allowed) => allowed.test(text))) {
      errors.push(text);
    }
  });
  // An uncaught exception. This is the zod class of bug, and it is never acceptable.
  page.on('pageerror', (error: Error) => {
    crashes.push(error.message);
  });

  return { errors, crashes };
}

/**
 * Sign in as one of the seeded demo accounts, through the real form and the real API.
 *
 * Located by `accessibilityLabel` — which react-native-web renders as `aria-label` — because
 * that is what the app already sets everywhere and what the jest tests already assert on. It
 * also means these selectors break if the labels break, which is the right coupling: the
 * labels are the accessibility contract.
 */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Sign in', { exact: true }).click();
}

test('the exported bundle boots without throwing, and renders the login form', async ({ page }) => {
  const { errors, crashes } = watchForFailures(page);

  await page.goto('/');

  // If the bundle threw on boot this is a blank page and the locator times out — which is
  // exactly the failure we want, and exactly the one CI could not see before.
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();

  expect(crashes, 'the bundle threw while booting').toEqual([]);
  expect(errors, 'the app logged console errors').toEqual([]);
});

test('a customer can sign in and post a request, and it comes back from the API', async ({
  page,
}) => {
  const { crashes } = watchForFailures(page);

  await page.goto('/');
  await signIn(page, 'customer@homefix.test', 'customer-pass');

  // Signing in swaps the whole navigator, so the requests list appearing is proof the token was
  // stored, the principal was decoded, and the authenticated API call succeeded — from a
  // browser, over HTTP, through the real client.
  await expect(page.getByLabel('New request', { exact: true })).toBeVisible();

  const description = `E2E leaking tap ${Date.now().toString()}`;
  await page.getByLabel('New request', { exact: true }).click();

  // Category and coordinates are required. Typing the coordinates keeps the test off the
  // browser's geolocation prompt and off the Maps picker, neither of which is what is under
  // test here.
  await page.getByLabel('Category plumbing', { exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Latitude', { exact: true }).fill('25.03');
  await page.getByLabel('Longitude', { exact: true }).fill('121.56');
  await page.getByLabel('Create request', { exact: true }).click();

  // The screen navigates back on success and the list reloads from the API, so seeing the
  // description again means it round-tripped through the server.
  await expect(page.getByText(description)).toBeVisible();

  expect(crashes, 'the app threw while creating a request').toEqual([]);
});

test('an invalid login is rejected without crashing the app', async ({ page }) => {
  const { crashes } = watchForFailures(page);

  await page.goto('/');
  await signIn(page, 'customer@homefix.test', 'definitely-not-the-password');

  // A 401 must surface as a message, not an unhandled rejection — `isApiError` is a structural
  // guard precisely because `instanceof` across module boundaries has failed here before.
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  expect(crashes, 'a rejected login threw').toEqual([]);
});
