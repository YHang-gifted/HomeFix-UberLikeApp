/**
 * Reports the assigned worker's live position to the server while they are on the way to a visit
 * (live-tracking Phase 2). Injected into the screen so tests drive start/stop and the web build can
 * omit it; the native implementation (app-expo) streams the device location — foreground for now,
 * a background TaskManager task in a later slice, which is why the seam is `start(requestId)` rather
 * than a screen-owned callback: a headless background task cannot call back into React. See
 * `docs/live-tracking.md`.
 */
export interface BackgroundTracker {
  /** Begin reporting the worker's position for this request until stopped. Safe to call repeatedly. */
  start(requestId: string): Promise<void>;
  /** Stop reporting. Safe to call when nothing is running. */
  stop(): Promise<void>;
}
