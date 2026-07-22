import type { PriceEstimate, ServiceCategory, ServiceRequest } from '../../../shared/schemas.ts';
import { AppError } from '../errors/appError.ts';
import { serviceRequestRepository } from '../repositories/serviceRequestRepository.ts';
import { isRequestParty } from './serviceRequestService.ts';
import type { Principal } from '../../../shared/schemas.ts';

/**
 * A **non-binding** rough range per category — the baseline estimate before any real AI is wired
 * in. Honest but crude: "plumbing jobs typically run $X–$Y". The prices are USD
 * ({@link PLATFORM_CURRENCY}) minor units and are **placeholders** (like the catalog), to be
 * calibrated against actual accepted quotes. A real vision model plugs in behind the seam below.
 */
const CATEGORY_ESTIMATES: Record<ServiceCategory, PriceEstimate> = {
  plumbing: { lowCents: 8000, highCents: 30000 },
  electrical: { lowCents: 9000, highCents: 35000 },
  cleaning: { lowCents: 6000, highCents: 20000 },
  appliance: { lowCents: 10000, highCents: 40000 },
  general: { lowCents: 5000, highCents: 25000 },
};

/**
 * Produces a rough range from what we know about the job. Injected so the real estimator (a vision
 * model over the photos + description) can be swapped in later — config-gated and mock-by-default,
 * like the payment providers — without touching callers. Returns undefined when it has no view.
 */
export type PriceEstimator = (input: {
  category: ServiceCategory;
  description: string;
  photoUrls: string[];
}) => Promise<PriceEstimate | undefined>;

/** The default estimator: the per-category baseline range (no external call). */
const categoryEstimator: PriceEstimator = ({ category }) =>
  Promise.resolve(CATEGORY_ESTIMATES[category]);

// globalThis-anchored test/override seam (same rationale as the payment-provider overrides: under
// tsx a module-local `let` set by a test may not be the instance the request path reads).
const ESTIMATOR_OVERRIDE_KEY = '__homefixPriceEstimatorOverride__';

function estimatorRegistry(): Record<string, PriceEstimator | undefined> {
  return globalThis as unknown as Record<string, PriceEstimator | undefined>;
}

function activeEstimator(): PriceEstimator {
  return estimatorRegistry()[ESTIMATOR_OVERRIDE_KEY] ?? categoryEstimator;
}

export function setPriceEstimatorForTests(estimator: PriceEstimator): void {
  estimatorRegistry()[ESTIMATOR_OVERRIDE_KEY] = estimator;
}

export function resetPriceEstimatorForTests(): void {
  estimatorRegistry()[ESTIMATOR_OVERRIDE_KEY] = undefined;
}

/**
 * A rough, non-binding price range for a request, visible to any party. A **fixed-price** job has
 * no estimate (its price is already set) — a 404, so the UI shows the fixed price instead. 404 when
 * the request is unknown; 403 for a non-party.
 */
export async function getEstimate(requestId: string, principal: Principal): Promise<PriceEstimate> {
  const request = await serviceRequestRepository.findById(requestId);
  if (!request) {
    throw new AppError('Service request not found', 404);
  }
  if (!isRequestParty(request, principal)) {
    throw new AppError('Not allowed to view this estimate', 403);
  }
  if (request.pricingMode === 'fixed') {
    throw new AppError('This job has a fixed price, so there is no estimate', 404);
  }
  const estimate = await estimateFor(request);
  if (estimate === undefined) {
    throw new AppError('No estimate is available for this request', 404);
  }
  return estimate;
}

/** Run the active estimator for a request's known details. */
function estimateFor(request: ServiceRequest): Promise<PriceEstimate | undefined> {
  return activeEstimator()({
    category: request.category,
    description: request.description,
    photoUrls: request.photoUrls ?? [],
  });
}
