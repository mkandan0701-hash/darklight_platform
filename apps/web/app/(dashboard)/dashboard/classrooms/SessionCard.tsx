import Link from "next/link";
import type { Role } from "@chessplay-clone/shared";
import type { BoardSession } from "../../../../repositories/liveSessionRepository";
import { dateBlockInZone } from "../../../../lib/time";
import { displayName } from "../../../../lib/displayName";
import { isUnconfirmed, type SessionBucket } from "../../../../lib/liveSession";
import { effectiveMeetingUrl, meetingButtonLabel } from "../../../../lib/meetingLink";
import { PieceAvatar } from "../../../../components/chess/PieceAvatar";
import { Badge } from "../../../../components/ui/Badge";
import { ICON_PROPS, Video } from "../../../../components/ui/icons";
import { CancelSessionButton } from "./[classroomId]/CancelSessionButton";
import { CopyLinkButton } from "./CopyLinkButton";
import { StartClassButton } from "./StartClassButton";

const MAX_AVATARS = 3;

function formatDuration(mins: number): string {
  if (mins % 60 === 0) return mins === 60 ? "1 hour" : `${mins / 60} hours`;
  if (mins > 60) return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return `${mins} min`;
}

const secondaryLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5";

/**
 * One class on the management board.
 *
 * `bucket` is the tab the card is being shown under — already computed by the
 * repository, so the card and the tab can't disagree about what state a
 * class is in.
 */
export function SessionCard({
  liveSession,
  bucket,
  viewer,
  now,
}: {
  liveSession: BoardSession;
  bucket: Exclude<SessionBucket, "CANCELLED">;
  viewer: { role: Role; timezone: string };
  now: Date;
}) {
  const { classroom } = liveSession;
  const block = dateBlockInZone(liveSession.scheduledAtUtc, viewer.timezone);
  const sessionPath = `/dashboard/classrooms/${classroom.id}/sessions/${liveSession.id}`;
  const meetingUrl = effectiveMeetingUrl(liveSession, classroom);
  const isStaff = viewer.role === "ACADEMY_ADMIN" || viewer.role === "COACH";
  const hasAttendance = liveSession._count.attendance > 0;
  const hasStarted = liveSession.startedAtUtc !== null;
  const pastStart = liveSession.scheduledAtUtc.getTime() <= now.getTime();

  const coaches = classroom.coaches.map((c) => displayName(c.coach.user));
  // Same rule as the classroom page: staff see the roster; a classmate or
  // another family doesn't get everyone else's names.
  const students = isStaff ? classroom.students.map((s) => s.student.user) : [];

  const canStart = viewer.role === "COACH" && (bucket === "CURRENT" || bucket === "DELAYED");
  // A meeting link is only worth a button while the class can still happen.
  const showMeeting = meetingUrl && (bucket === "CURRENT" || bucket === "UPCOMING");

  return (
    <li
      className={`flex flex-wrap items-center gap-x-6 gap-y-4 rounded-xl border border-ink/10 bg-white px-5 py-4 shadow-sm ${
        bucket === "DELAYED" ? "border-l-4 border-l-brick" : ""
      } ${bucket === "CURRENT" ? "border-l-4 border-l-board" : ""}`}
    >
      {/* Calendar tile — every part of it in the viewer's zone. */}
      <div className="w-16 shrink-0 text-center">
        <p className="font-display text-3xl font-bold leading-none text-ink">{block.day}</p>
        <p className="mt-1 text-[11px] font-semibold tracking-wide text-slate">
          {block.weekday.toUpperCase()} · {block.month}
        </p>
        <p className="mt-1 text-[11px] text-slate">{block.time}</p>
      </div>

      <div className="hidden h-14 border-l border-dashed border-ink/15 sm:block" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={sessionPath} className="font-display text-lg font-semibold text-ink hover:underline">
            {classroom.name}
          </Link>
          {meetingUrl && (
            <Video {...ICON_PROPS} size={16} className="text-board" aria-label="Has a meeting link" />
          )}
          {bucket === "CURRENT" && hasStarted && <Badge tone="solid">Live now</Badge>}
          {bucket === "CURRENT" && !hasStarted && pastStart && (
            <Badge tone="warn">Not started yet</Badge>
          )}
          {bucket === "DELAYED" && <Badge tone="danger">Not started</Badge>}
          {bucket === "COMPLETED" &&
            isUnconfirmed(liveSession, { hasAttendance }, now) && (
              <Badge tone="muted">Unconfirmed</Badge>
            )}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate">
          {coaches.length > 0 && (
            <span className="rounded-md bg-parchment px-2 py-0.5 text-ink">
              Coach: {coaches.join(", ")}
            </span>
          )}
          <span>· {formatDuration(liveSession.durationMins)}</span>
          <span>· {block.zoneAbbr}</span>
        </p>

        {students.length > 0 && (
          <ul className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink">
            {students.slice(0, MAX_AVATARS).map((user) => (
              <li key={user.id} className="flex items-center gap-1.5">
                <PieceAvatar seed={user.id} name={displayName(user)} className="h-6 w-6" />
                {displayName(user)}
              </li>
            ))}
            {students.length > MAX_AVATARS && (
              <li className="text-xs text-slate">+{students.length - MAX_AVATARS} more</li>
            )}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {showMeeting && (
          <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className={secondaryLinkClass}>
            {meetingButtonLabel(meetingUrl)}
          </a>
        )}
        {canStart ? (
          <StartClassButton
            classroomId={classroom.id}
            liveSessionId={liveSession.id}
            label={bucket === "DELAYED" ? "Start late" : "Start Classroom"}
          />
        ) : (
          <Link href={sessionPath} className={secondaryLinkClass}>
            {bucket === "CURRENT" && viewer.role === "STUDENT" ? "Enter class" : "View"}
          </Link>
        )}
        <CopyLinkButton path={sessionPath} />
        {isStaff && bucket !== "COMPLETED" && (
          <CancelSessionButton classroomId={classroom.id} liveSessionId={liveSession.id} />
        )}
      </div>
    </li>
  );
}
