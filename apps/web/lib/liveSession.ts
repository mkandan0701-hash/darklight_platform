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
