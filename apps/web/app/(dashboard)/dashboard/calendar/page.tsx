import { DateTime } from "luxon";
import { getCurrentSession } from "../../../../lib/auth/session";
import { displayName } from "../../../../lib/displayName";
import { parseServerParams } from "../../../../lib/calendar/params";
import {
  formatAnchor,
  parseAnchor,
  rangeLabel,
  resolveZone,
  viewRange,
} from "../../../../lib/calendar/range";
import {
  listCalendarEvents,
  listCoachOptions,
  listSchedulableClassrooms,
  listStudentOptions,
  type CalendarScope,
  type CalendarViewer,
} from "../../../../repositories/calendarRepository";
import {
  getChildForParent,
  getCoachProfileByUserId,
  getParentProfileByUserId,
  getStudentProfileByUserId,
  listStudentsForParent,
} from "../../../../repositories/userRepository";
import { pageHeadingClass } from "../../../../components/ui/styles";
import { CalendarClient } from "./CalendarClient";

// Server half of the calendar: resolves who is looking and whose schedule
// they asked for, then fetches only that window. Every narrowing parameter in
// the URL (coach, student, child) is re-checked here against the viewer's
// role before it reaches a query — and the queries intersect it with the
// viewer's own visibility again, so a hand-edited link can only ever produce
// a smaller calendar, never someone else's.

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const session = await getCurrentSession();
  const params = parseServerParams(searchParams);

  const zone = resolveZone(params.tz, session.timezone);
  const anchor = parseAnchor(params.date, zone);
  const { start, end } = viewRange(params.view, anchor);

  const isAdmin = session.role === "ACADEMY_ADMIN";
  const isStaff = isAdmin || session.role === "COACH";

  const coachProfile =
    session.role === "COACH" ? await getCoachProfileByUserId(session.tenantId, session.id) : null;
  const viewer: CalendarViewer = {
    tenantId: session.tenantId,
    id: session.id,
    role: session.role,
    coachProfileId: coachProfile?.id ?? null,
  };

  // Staff pick students from the rooms they can see; the filter is honoured
  // only for a student on that list.
  const studentOptions = isStaff ? await listStudentOptions(viewer) : [];
  const studentFilter =
    params.student && studentOptions.some((s) => s.id === params.student) ? params.student : undefined;

  // Whose schedule, per role.
  let scope: CalendarScope | null = {};
  let children: { id: string; label: string }[] = [];
  let selectedChild: string | undefined;

  switch (session.role) {
    case "ACADEMY_ADMIN":
      scope = { coachProfileId: params.coach, studentProfileId: studentFilter };
      break;
    case "COACH":
      // A coach's calendar is already limited to their own rooms; a student
      // filter narrows within that, and a coach filter isn't offered.
      scope = { studentProfileId: studentFilter };
      break;
    case "STUDENT": {
      const me = await getStudentProfileByUserId(session.tenantId, session.id);
      scope = me ? { studentProfileId: me.id } : null;
      break;
    }
    case "PARENT": {
      const parent = await getParentProfileByUserId(session.tenantId, session.id);
      const links = parent ? await listStudentsForParent(session.tenantId, parent.id) : [];
      children = links
        .map((l) => ({ id: l.student.id, label: displayName(l.student.user) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      // The same gate as every other parent-facing child page. A child id
      // that fails it (stale link, someone else's child) falls back to the
      // parent's own first child rather than an empty calendar.
      const requested = params.child ? await getChildForParent(session, params.child) : null;
      const child = requested ?? (children[0] ? await getChildForParent(session, children[0].id) : null);
      selectedChild = child?.id;
      scope = child ? { studentProfileId: child.id } : null;
      break;
    }
  }

  const [events, coachOptions, classroomOptions] = await Promise.all([
    scope
      ? listCalendarEvents(viewer, scope, { startUtc: start.toUTC().toJSDate(), endUtc: end.toUTC().toJSDate() })
      : Promise.resolve([]),
    isAdmin ? listCoachOptions(session.tenantId) : Promise.resolve([]),
    isStaff ? listSchedulableClassrooms(viewer) : Promise.resolve([]),
  ]);

  const now = DateTime.now().setZone(zone);

  return (
    <div>
      <header>
        <h1 className={pageHeadingClass}>Calendar</h1>
        <p className="mt-1 text-sm text-slate">
          Your academy command center — classes, homework, tournaments and more.
        </p>
      </header>

      <CalendarClient
        events={events}
        view={params.view}
        anchor={formatAnchor(anchor)}
        label={rangeLabel(params.view, anchor)}
        zone={zone}
        userZone={session.timezone}
        today={now.toFormat("yyyy-LL-dd")}
        role={session.role}
        ownCoachProfileId={coachProfile?.id ?? null}
        coachOptions={coachOptions}
        studentOptions={studentOptions}
        childOptions={children}
        classroomOptions={classroomOptions}
        selected={{
          coach: isAdmin ? params.coach : undefined,
          student: studentFilter,
          child: selectedChild,
        }}
        emptyReason={
          scope
            ? null
            : session.role === "PARENT"
              ? "No children are linked to your account yet. Ask the academy to link them."
              : "Your student profile is missing. Ask the academy to check your account."
        }
      />
    </div>
  );
}
