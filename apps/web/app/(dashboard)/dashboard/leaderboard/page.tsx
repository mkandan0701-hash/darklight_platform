import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentSession } from "../../../../lib/auth/session";
import { displayName } from "../../../../lib/displayName";
import { periodBounds } from "../../../../lib/periods";
import { resolveZone } from "../../../../lib/calendar/range";
import { listClassroomsForViewer } from "../../../../repositories/classroomRepository";
import { getClassroomLeaderboard } from "../../../../repositories/gamificationRepository";
import { getTenantBySubdomain } from "../../../../repositories/tenantRepository";
import {
  getParentProfileByUserId,
  getStudentProfileByUserId,
  listStudentsForParent,
} from "../../../../repositories/userRepository";
import { pageHeadingClass } from "../../../../components/ui/styles";
import { LeaderboardClient, type LeaderboardPeriod } from "./LeaderboardClient";

// Classroom standings (claude.md §9: never academy-wide or public). The room
// list comes from listClassroomsForViewer, which already applies role
// membership — so a `?room=` the viewer isn't in simply isn't on the list and
// falls back to their first room, revealing nothing about it.

const PeriodSchema = z.enum(["day", "week", "month"]);

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getCurrentSession();
  const one = (k: string) => {
    const v = searchParams[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const parsedPeriod = PeriodSchema.safeParse(one("period"));
  const period: LeaderboardPeriod = parsedPeriod.success ? parsedPeriod.data : "week";

  const rooms = await listClassroomsForViewer(session);
  const room = rooms.find((r) => r.id === one("room")) ?? rooms[0];

  // Periods are an academy question ("this week" means the same thing to
  // everyone in it), so they are bounded in the academy's zone — lib/periods.ts.
  const tenant = await getTenantBySubdomain(headers().get("x-tenant-subdomain") ?? "");
  const zone = resolveZone(tenant?.timezone, session.timezone);
  const bounds = periodBounds(period, zone);

  // Whose rows to highlight: yourself, or a parent's own children.
  let mine: string[] = [];
  if (session.role === "STUDENT") {
    const me = await getStudentProfileByUserId(session.tenantId, session.id);
    mine = me ? [me.id] : [];
  } else if (session.role === "PARENT") {
    const parent = await getParentProfileByUserId(session.tenantId, session.id);
    mine = parent ? (await listStudentsForParent(session.tenantId, parent.id)).map((l) => l.studentId) : [];
  }

  const board = room ? await getClassroomLeaderboard(session.tenantId, room.id, bounds) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className={pageHeadingClass}>Leaderboard</h1>
      <p className="mt-1 text-sm text-slate">
        Track rankings based on points earned from homework puzzles and classes attended.
      </p>
      <LeaderboardClient
        period={period}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
        roomId={room?.id ?? null}
        isStaff={session.role === "ACADEMY_ADMIN" || session.role === "COACH"}
        // Names and counts only — no emails leave the server.
        rows={board.map((r) => ({
          studentId: r.studentId,
          userId: r.user.id,
          name: displayName(r.user),
          xp: r.xp,
          puzzlesSolved: r.puzzlesSolved,
          classesAttended: r.classesAttended,
          badges: r.badges,
          rank: r.rank,
          mine: mine.includes(r.studentId),
        }))}
      />
    </div>
  );
}
