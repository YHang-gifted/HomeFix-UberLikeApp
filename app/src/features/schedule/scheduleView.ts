import type { Principal, ScheduleProposer, ServiceRequest } from '../../../../shared/schemas.ts';

/**
 * The visit time is a two-party agreement: either party proposes, and only the OTHER one may
 * confirm. This derives everything the screen needs to render that negotiation, so the screen
 * itself stays dumb (same approach as `deriveQuoteView`).
 */

export interface ScheduleViewInput {
  principal: Principal | null;
  request: ServiceRequest;
}

export interface ScheduleView {
  /** Whether to show the Visit section at all. */
  visible: boolean;
  /** One line describing where the time stands, written for whoever is looking. */
  summary: string;
  /** The viewer may confirm — i.e. the OTHER party has a proposal outstanding. */
  canConfirm: boolean;
  /** The viewer may put a (new) time on the table. */
  canPropose: boolean;
  /** 'Propose a time' the first time, 'Propose a new time' once one is agreed. */
  proposeLabel: string;
  /**
   * The assigned worker may set out ("on my way") for a confirmed visit they have not yet started
   * heading to. Live-tracking Phase 1 — see `docs/live-tracking.md`.
   */
  canMarkEnRoute: boolean;
  /** A line shown once the worker is on the way, written for the viewer; null before then. */
  enRouteSummary: string | null;
}

/** Which scheduling party the viewer is, or null if they are not a party (e.g. an admin). */
function partyFor(input: ScheduleViewInput): ScheduleProposer | null {
  const { principal, request } = input;
  if (principal === null) {
    return null;
  }
  if (principal.role === 'customer' && principal.id === request.customerId) {
    return 'customer';
  }
  if (principal.role === 'worker' && principal.id === request.workerId) {
    return 'worker';
  }
  return null;
}

/** The other side's name, for prose. */
function otherName(me: ScheduleProposer): string {
  return me === 'customer' ? 'worker' : 'customer';
}

/**
 * A visit can only be negotiated while there is a worker to negotiate with and the job is
 * still open — mirrors the server's guards, so the UI never offers an action that would 422.
 */
function isNegotiable(request: ServiceRequest): boolean {
  return (
    request.workerId !== undefined &&
    request.status !== 'completed' &&
    request.status !== 'cancelled'
  );
}

export function deriveScheduleView(input: ScheduleViewInput): ScheduleView {
  const { request } = input;
  const me = partyFor(input);
  const canAct = me !== null && isNegotiable(request);
  const time =
    request.scheduledAt === undefined ? '' : new Date(request.scheduledAt).toLocaleString();

  const canConfirm =
    canAct && request.scheduleStatus === 'proposed' && request.scheduleProposedBy !== me;

  let summary: string;
  if (request.scheduleStatus === 'confirmed') {
    summary = `Confirmed for ${time}`;
  } else if (request.scheduleStatus === 'proposed') {
    if (me === null) {
      summary = `Proposed for ${time} — not yet confirmed`;
    } else if (request.scheduleProposedBy === me) {
      summary = `You proposed ${time} — waiting for the ${otherName(me)} to confirm.`;
    } else {
      summary = `The ${otherName(me)} proposed ${time} — confirm it, or suggest another time.`;
    }
  } else {
    summary = 'No visit time agreed yet.';
  }

  const canMarkEnRoute =
    me === 'worker' &&
    isNegotiable(request) &&
    request.scheduleStatus === 'confirmed' &&
    request.enRouteAt === undefined;

  let enRouteSummary: string | null = null;
  if (request.enRouteAt !== undefined) {
    const etaText =
      request.enRouteEtaMinutes !== undefined
        ? ` — about ${String(request.enRouteEtaMinutes)} min away`
        : '';
    enRouteSummary =
      me === 'worker' ? "You're on the way to this visit." : `Your worker is on the way${etaText}.`;
  }

  return {
    visible: request.scheduledAt !== undefined || canAct,
    summary,
    canConfirm,
    canPropose: canAct,
    proposeLabel: request.scheduleStatus === 'confirmed' ? 'Propose a new time' : 'Propose a time',
    canMarkEnRoute,
    enRouteSummary,
  };
}
