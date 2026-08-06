import Link from "next/link";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { textLinkClass } from "../ui/styles";
import { formatInZone } from "../../lib/time";

// Structural rather than derived from the repository's return type: the two
// callers reach it through different queries (listUpcomingSessionsForClassrooms
// for the dashboard, the same call scoped to one child for the parent portal),
// and a Prisma-derived type would tie this component to whichever one was
// written first.
export type SessionListItem = {
  id: string;
  classroomId: string;
  durationMins: number;
  scheduledAtUtc: Date;
  classroom: { name: string };
};

/**
 * Upcoming classes, always rendered in the *viewer's* zone.
 *
 * `timezone` is the reader's, never the scheduler's — a coach in Chennai
 * scheduling 9pm IST and a parent in New Jersey reading 11:30am EST are the
 * same row, and getting that backwards is the product's whole wedge
 * (claude.md §3.5).
 */
export function SessionList({
  sessions,
  timezone,
  emptyDescription,
  hrefFor,
}: {
  sessions: SessionListItem[];
  timezone: string;
  emptyDescription: string;
  /**
   * Where a row links, or null for a row that shouldn't link at all. Defaults
   * to the live session page. A parent gets the read-only view of that same
   * page, so they still get links — but a caller rendering sessions the viewer
   * has no route to can turn them off.
   */
  hrefFor?: (session: SessionListItem) => string | null;
}) {
  if (sessions.length === 0) {
    return (
      <div className="mt-3">
        <EmptyState title="No sessions scheduled" description={emptyDescription} />
      </div>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {sessions.map((session) => {
        const href = hrefFor
          ? hrefFor(session)
          : `/dashboard/classrooms/${session.classroomId}/sessions/${session.id}`;
        const when = formatInZone(session.scheduledAtUtc, timezone);

        return (
          <Card key={session.id} className="flex items-center justify-between gap-4 p-4">
            {href ? (
              <Link href={href} className={textLinkClass}>
                {when}
              </Link>
            ) : (
              <span className="font-medium text-ink">{when}</span>
            )}
            <span className="text-xs text-slate">
              {session.classroom.name} · {session.durationMins} min
            </span>
          </Card>
        );
      })}
    </ul>
  );
}
