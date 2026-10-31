// Where a live session is in its lifecycle.
//
// The stored LiveSession.status column was written once, at creation, and
// never again: every session in the database read SCHEDULED forever, including
// classes taught weeks ago. The obvious fix — write LIVE when someone joins,
// COMPLETED when the coach marks attendance — reintroduces the same bug in a
// quieter form, because a session nobody joins and nobody marks stays
// SCHEDULED for good, and correcting that needs a cron nothing else here
// needs.
//
// So the clock decides the three statuses the clock already determines, and
// the column stores only the one it cannot: CANCELLED, which is a human
// decision and sticky. Nothing can get stuck, and there is no scheduled job.

export type SessionLifecycle = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";

export type SessionTiming = {
  scheduledAtUtc: Date;
  durationMins: number;
  // The stored column. Only CANCELLED is read from it — see above.
  status: string;
};

export function effectiveSessionStatus(
  session: SessionTiming,
  now: Date = new Date()
): SessionLifecycle {
  // A cancelled class does not become "live" because its start time arrives.
  if (session.status === "CANCELLED") return "CANCELLED";

  const start = session.scheduledAtUtc.getTime();
  // Guard the data, not just the clock: a non-finite or negative duration
  // would otherwise make `end` <= `start` and report a session COMPLETED at
  // the instant it starts.
  const durationMs =
    Number.isFinite(session.durationMins) && session.durationMins > 0
      ? session.durationMins * 60_000
      : 0;
  const end = start + durationMs;
  const t = now.getTime();

  if (t < start) return "SCHEDULED";
  // Inclusive of the start instant, exclusive of the end: a zero-duration
  // session is over immediately rather than permanently live.
  if (t < end) return "LIVE";
  return "COMPLETED";
}

/** Whether this session is still ahead — what a "next sessions" list wants. */
export function isUpcoming(session: SessionTiming, now: Date = new Date()): boolean {
  const status = effectiveSessionStatus(session, now);
  return status === "SCHEDULED" || status === "LIVE";
}

const LABELS: Record<SessionLifecycle, string> = {
  SCHEDULED: "Scheduled",
  LIVE: "Live now",
  COMPLETED: "Finished",
  CANCELLED: "Cancelled",
};

export function sessionStatusLabel(status: SessionLifecycle): string {
  return LABELS[status];
}

// ---------------------------------------------------------------------------
// Tabs on the classroom management board.
//
// The three clock statuses above can't tell "taught" from "nobody turned up":
// both read COMPLETED once the end time passes. The board needs that
// difference — a class that should have happened and didn't is the one a
// coach has to act on — so it also looks at two recorded facts:
// LiveSession.startedAtUtc (the coach pressed Start) and whether attendance
// was marked. Neither is a status that needs flipping later, so this keeps the
// no-stale-state property described at the top of this file.
// ---------------------------------------------------------------------------

export type SessionBucket = "CURRENT" | "UPCOMING" | "DELAYED" | "COMPLETED" | "CANCELLED";

export const SESSION_BUCKETS = ["CURRENT", "UPCOMING", "DELAYED", "COMPLETED"] as const;

/** How early a class counts as "current" — long enough to open the room and set up a board. */
export const CURRENT_LEAD_MINS = 15;

/**
 * How long an unconfirmed class stays in Delayed before it is filed under
 * Completed as "unconfirmed". Without a cutoff, every class taught before
 * startedAtUtc existed would land in Delayed on the day this shipped.
 */
export const DELAYED_WINDOW_DAYS = 14;

export type BucketableSession = SessionTiming & { startedAtUtc: Date | null };

export function sessionBucket(
  session: BucketableSession,
  facts: { hasAttendance: boolean },
  now: Date = new Date()
): SessionBucket {
  const status = effectiveSessionStatus(session, now);
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "LIVE") return "CURRENT";
  if (status === "SCHEDULED") {
    const leadMs = CURRENT_LEAD_MINS * 60_000;
    return session.scheduledAtUtc.getTime() - now.getTime() <= leadMs ? "CURRENT" : "UPCOMING";
  }
  // Clock says it's over. Was it actually held?
  if (session.startedAtUtc || facts.hasAttendance) return "COMPLETED";
  return isWithinDelayedWindow(session, now) ? "DELAYED" : "COMPLETED";
}

/** A finished class nobody confirmed — Completed by age, not by evidence. */
export function isUnconfirmed(
  session: BucketableSession,
  facts: { hasAttendance: boolean },
  now: Date = new Date()
): boolean {
  return (
    sessionBucket(session, facts, now) === "COMPLETED" &&
    !session.startedAtUtc &&
    !facts.hasAttendance
  );
}

function isWithinDelayedWindow(session: SessionTiming, now: Date): boolean {
  const durationMs = Math.max(0, session.durationMins || 0) * 60_000;
  const end = session.scheduledAtUtc.getTime() + durationMs;
  return now.getTime() - end < DELAYED_WINDOW_DAYS * 86_400_000;
}

/** Whether the coach may press Start now: the class is current, or overdue and unresolved. */
export function canStartSession(
  session: BucketableSession,
  facts: { hasAttendance: boolean },
  now: Date = new Date()
): boolean {
  const bucket = sessionBucket(session, facts, now);
  return bucket === "CURRENT" || bucket === "DELAYED";
}
