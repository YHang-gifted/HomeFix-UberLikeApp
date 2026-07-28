import type { Coordinates } from '../../../shared/schemas.ts';
import { loadEnv } from '../config/env.ts';
import { logger } from '../utils/logger.ts';

/**
 * Estimate road travel time (whole minutes) from an origin to a destination, or undefined when no
 * estimate is available. Injected — config-gated and mock-by-default, like the payment and
 * price-estimate seams — so the real Google Distance Matrix call is swapped in behind a key and
 * tests drive a fake. See `docs/live-tracking.md`.
 */
export type TravelTimeEstimator = (
  origin: Coordinates,
  destination: Coordinates,
) => Promise<number | undefined>;

interface DistanceMatrixResponse {
  rows?: { elements?: { status?: string; duration?: { value?: number } }[] }[];
}

/** Call Google's Distance Matrix API and return the driving duration in minutes, or undefined. */
async function fetchGoogleTravelMinutes(
  apiKey: string,
  origin: Coordinates,
  destination: Coordinates,
): Promise<number | undefined> {
  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', `${String(origin.latitude)},${String(origin.longitude)}`);
  url.searchParams.set(
    'destinations',
    `${String(destination.latitude)},${String(destination.longitude)}`,
  );
  url.searchParams.set('mode', 'driving');
  url.searchParams.set('key', apiKey);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as DistanceMatrixResponse;
    const element = body.rows?.[0]?.elements?.[0];
    const seconds = element?.status === 'OK' ? element.duration?.value : undefined;
    if (typeof seconds !== 'number' || seconds <= 0) {
      return undefined;
    }
    return Math.max(1, Math.round(seconds / 60));
  } catch (error) {
    logger.error('travel-time estimate failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return undefined;
  }
}

/** The default estimator: Google Distance Matrix when a key is set, otherwise no estimate. */
const defaultEstimator: TravelTimeEstimator = (origin, destination) => {
  const apiKey = loadEnv().GOOGLE_MAPS_API_KEY;
  if (apiKey === undefined) {
    return Promise.resolve(undefined);
  }
  return fetchGoogleTravelMinutes(apiKey, origin, destination);
};

// globalThis-anchored override (same rationale as the price-estimator seam: under tsx a module-local
// `let` set by a test may not be the instance the request path reads).
const OVERRIDE_KEY = '__homefixTravelTimeEstimatorOverride__';

function registry(): Record<string, TravelTimeEstimator | undefined> {
  return globalThis as unknown as Record<string, TravelTimeEstimator | undefined>;
}

function activeEstimator(): TravelTimeEstimator {
  return registry()[OVERRIDE_KEY] ?? defaultEstimator;
}

export function setTravelTimeEstimatorForTests(estimator: TravelTimeEstimator): void {
  registry()[OVERRIDE_KEY] = estimator;
}

export function resetTravelTimeEstimatorForTests(): void {
  registry()[OVERRIDE_KEY] = undefined;
}

/** Rough travel time in minutes from origin to destination, or undefined when unavailable. */
export function estimateTravelMinutes(
  origin: Coordinates,
  destination: Coordinates,
): Promise<number | undefined> {
  return activeEstimator()(origin, destination);
}
