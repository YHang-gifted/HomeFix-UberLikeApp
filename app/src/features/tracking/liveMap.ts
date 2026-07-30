import type { Coordinates } from '../../../../shared/schemas';

/** What a live map needs to draw: where the worker is now, and where they are headed. */
export interface LiveMapProps {
  /** The worker's latest live position, recentred on each update. */
  worker: Coordinates;
  /** The job site the worker is heading to. */
  destination: Coordinates;
}
