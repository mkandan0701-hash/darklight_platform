import Link from "next/link";
import { formatInZone } from "../../lib/time";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { textLinkClass } from "../ui/styles";

// Structural, not Prisma-derived: the dashboard home passes rows from
// listUpcomingSessionsForClassrooms, the parent portal passes the same rows
// for one child. Naming the fields keeps this component from depending on
// which query produced them.
export type UpcomingSession = {
  id: string;
  classroomId: string;
  scheduledAtUtc: Date;
  durationMins: number;
  classroom: { name: string };
};

export function SessionList({
  sessions,
  timezone,
  emptyDescription,
}: {
  sessions: UpcomingSession[];
  timezone: string;
  emptyDescription: string;
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
      {sessions.map((liveSession) => (
        <Card key={liveSession.id} className="flex items-center justify-between gap-4 p-4">
          <Link
            href={`/dashboard/classrooms/${liveSession.classroomId}/sessions/${liveSession.id}`}
            className={textLinkClass}
          >
            {/* Always the viewer's zone, never the scheduler's (claude.md §3.5).
                For a parent that is the parent's zone, not the child's. */}
            {formatInZone(liveSession.scheduledAtUtc, timezone)}
          </Link>
          <span className="text-xs text-slate">
            {liveSession.classroom.name} · {liveSession.durationMins} min
          </span>
        </Card>
      ))}
    </ul>
  );
}
