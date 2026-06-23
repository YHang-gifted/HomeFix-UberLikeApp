import type { ServiceRequestStatus } from '../../../../shared/schemas.ts';

/**
 * The next status an assigned worker can advance a request to, or null when the
 * worker has no forward action (mirrors the server-side allowed transitions for
 * a worker: matched -> accepted -> in_progress -> completed).
 */
export function nextWorkerStatus(current: ServiceRequestStatus): ServiceRequestStatus | null {
  switch (current) {
    case 'matched':
      return 'accepted';
    case 'accepted':
      return 'in_progress';
    case 'in_progress':
      return 'completed';
    default:
      return null;
  }
}

/** A user-facing label for the worker's next action, or null when there is none. */
export function workerActionLabel(current: ServiceRequestStatus): string | null {
  switch (current) {
    case 'matched':
      return 'Accept job';
    case 'accepted':
      return 'Start work';
    case 'in_progress':
      return 'Mark complete';
    default:
      return null;
  }
}
