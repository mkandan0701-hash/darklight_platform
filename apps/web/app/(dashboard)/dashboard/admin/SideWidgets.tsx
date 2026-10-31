import Link from "next/link";
import { DateTime } from "luxon";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Activity, CalendarDays, Clock } from "../../../../components/ui/icons";
import { textLinkClass } from "../../../../components/ui/styles";
import { displayName } from "../../../../lib/displayName";
import { effectiveSessionStatus, isUpcoming, sessionStatusLabel } from "../../../../lib/liveSession";
import { relativeTime } from "../../../../lib/metrics";
import {
  getSessionsToday,
  getUpcomingSessions,
} from "../../../../repositories/dashboardMetricsRepository";
import { ACTIVITY_VERB, getRecentActivity } from "../../../../repositories/activityRepository";
import { PanelEmpty, PanelError, PanelHeading } from "./WidgetChrome";

/** Clock time in the viewer's own zone — never the scheduler's (claude.md §3.5). */
function clock(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(zone).toFormat("h:mm a");
}

function dayAndClock(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone: "utc" }).setZone(zone).toFormat("ccc d LLL, h:mm a");
}

export async function TodaysClassrooms({
  tenantId,
  academyZone,
  viewerZone,
  now,
}: {
  tenantId: string;
  academyZone: string;
  viewerZone: string;
  now: Date;
}) {
  let sessions;
  try {
    // "Today" is the academy's day — an admin travelling must not see a
    // different set of classes from the coach teaching them.
    sessions = await getSessionsToday(tenantId, academyZone, now.getTime());
  } catch (err) {
    console.error("Today's classrooms query failed", err);
    return <PanelError title="Today's Classrooms" />;
  }

  return (
    <Card>
      <PanelHeading icon={CalendarDays} title="Today's Classrooms" />
      {sessions.length === 0 ? (
        <PanelEmpty>No classrooms scheduled today</PanelEmpty>
      ) : (
        <ul className="mt-3 space-y-2">
          {sessions.map((s) => {
            const status = effectiveSessionStatus(s, now);
            const coaches = s.classroom.coaches
              .map((c) => displayName(c.coach.user))
              .join(", ");
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/classrooms/${s.classroom.id}`}
                    className={`${textLinkClass} text-sm`}
                  >
                    {s.classroom.name}
                  </Link>
                  <p className="truncate text-xs text-slate">
                    {clock(s.scheduledAtUtc, viewerZone)} · {s.classroom._count.students}{" "}
                    {s.classroom._count.students === 1 ? "student" : "students"}
                    {coaches && ` · ${coaches}`}
                  </p>
                </div>
                <Badge tone={status === "LIVE" ? "solid" : "neutral"}>
                  {sessionStatusLabel(status)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export async function UpcomingSessionsPanel({
  tenantId,
  viewerZone,
  now,
}: {
  tenantId: string;
  viewerZone: string;
  now: Date;
}) {
  let sessions;
  try {
    sessions = await getUpcomingSessions(tenantId, now);
  } catch (err) {
    console.error("Upcoming sessions query failed", err);
    return <PanelError title="Upcoming Sessions" />;
  }

  // Cancelled is filtered in SQL; finished has to be filtered here, because
  // "over" is start plus duration and that is not a column. Without this, a
  // class that ended an hour ago sits in a list headed "upcoming".
  const upcoming = sessions.filter((s) => isUpcoming(s, now));

  return (
    <Card>
      <PanelHeading icon={Clock} title="Upcoming Sessions" />
      {upcoming.length === 0 ? (
        <PanelEmpty>No upcoming sessions for the next 7 days.</PanelEmpty>
      ) : (
        <ul className="mt-3 space-y-2">
          {upcoming.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 p-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/dashboard/classrooms/${s.classroom.id}/sessions/${s.id}`}
                  className={`${textLinkClass} text-sm`}
                >
                  {s.classroom.name}
                </Link>
                <p className="truncate text-xs text-slate">
                  {dayAndClock(s.scheduledAtUtc, viewerZone)} · {s.durationMins} min
                </p>
              </div>
              {effectiveSessionStatus(s, now) === "LIVE" && <Badge tone="solid">Live now</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function RecentActivityPanel({ tenantId, now }: { tenantId: string; now: Date }) {
  let entries;
  try {
    entries = await getRecentActivity(tenantId);
  } catch (err) {
    console.error("Recent activity query failed", err);
    return <PanelError title="Recent Activity" />;
  }

  return (
    <Card>
      <PanelHeading icon={Activity} title="Recent Activity" />
      {entries.length === 0 ? (
        <PanelEmpty>Nothing has happened in this academy yet.</PanelEmpty>
      ) : (
        <ul className="mt-3 space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span
                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-board"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {/* Only three of the sources record who acted. Where none is
                      recorded the sentence simply has no subject, rather than
                      attributing the act to a plausible-looking name. */}
                  {entry.actor && <span className="font-medium">{entry.actor} · </span>}
                  {ACTIVITY_VERB[entry.kind]}
                </p>
                <p className="truncate text-xs text-slate">
                  {entry.subject} · {relativeTime(entry.at, now)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
