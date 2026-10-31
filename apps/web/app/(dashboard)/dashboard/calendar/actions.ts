"use server";

import { z } from "zod";
import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import { computeUpcomingOccurrencesUtc } from "@chessplay-clone/shared";
import { getCurrentSession, type CurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc } from "../../../../lib/time";
import { parseMeetingUrl } from "../../../../lib/meetingLink";
import { isValidZone } from "../../../../lib/calendar/range";
import { expandRecurrence, RecurrenceError, type Recurrence } from "../../../../lib/calendar/recurrence";
import { summarizeConflicts, type ScheduleConflict } from "../../../../lib/calendar/conflicts";
import { planSeriesMove, scopeStart } from "../../../../lib/calendar/seriesEdit";
import { isCoachAssignedToClassroom } from "../../../../repositories/classroomRepository";
import { getCoachProfileByUserId } from "../../../../repositories/userRepository";
import { createScheduleSlot, materializeSlot } from "../../../../repositories/scheduleSlotRepository";
import {
  ConcurrentEditError,
  cancelSessions,
  createCalendarBlock,
  createCalendarSessions,
  deleteCalendarBlock,
  findScheduleConflicts,
  getCalendarBlock,
  getSessionForCalendarEdit,
  listSeriesSessionsFrom,
  rescheduleSessions,
  splitSlotSeries,
  updateCalendarBlock,
  type BlockInput,
} from "../../../../repositories/calendarRepository";

// Server actions behind the calendar. Each one re-derives the actor's rights
// from the session — the client's `canEdit` flag decides which buttons show,
// never what is allowed.
//
// Conflict flow: a save that would clash returns `conflicts` instead of
// writing. Coaches must pick another time; an academy admin may resend with
// `override: true`, and the clash is recorded on the audit row
// (LiveSessionChange.conflictOverride/conflictSummary).

export type CalendarActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; conflicts?: ScheduleConflict[]; canOverride?: boolean };

const LocalDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time");
const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const Zone = z.string().refine(isValidZone, "Choose a valid timezone");
const Id = z.string().min(1).max(64);
const Weekdays = z.array(z.number().int().min(1).max(7)).max(7);
const End = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("COUNT"), count: z.number().int().min(1).max(104) }),
  z.object({ kind: z.literal("UNTIL"), until: LocalDate }),
]);
const RecurrenceSchema = z.discriminatedUnion("freq", [
  z.object({ freq: z.literal("NONE") }),
  z.object({ freq: z.literal("DAILY"), interval: z.number().int().min(1).max(52), end: End }),
  z.object({
    freq: z.literal("WEEKLY"),
    interval: z.number().int().min(1).max(52),
    weekdays: Weekdays,
    end: End,
  }),
  // Open-ended: becomes ClassroomScheduleSlot templates, extended nightly.
  z.object({ freq: z.literal("WEEKLY_ONGOING"), weekdays: Weekdays.min(1, "Pick at least one day") }),
]);
const Duration = z.number().int().min(15, "Classes are at least 15 minutes").max(240, "Classes are at most 4 hours");

const isAdmin = (s: CurrentSession) => s.role === "ACADEMY_ADMIN";

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

function revalidateSchedule(classroomId?: string) {
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/classrooms");
  revalidatePath("/dashboard");
  if (classroomId) revalidatePath(`/dashboard/classrooms/${classroomId}`);
}

async function requireStaff(): Promise<
  { ok: true; session: CurrentSession; coachProfileId: string | null } | { ok: false; error: string }
> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins and coaches can change the schedule" };
  }
  const coachProfileId =
    session.role === "COACH"
      ? ((await getCoachProfileByUserId(session.tenantId, session.id))?.id ?? null)
      : null;
  if (session.role === "COACH" && !coachProfileId) {
    return { ok: false, error: "Your coach profile is missing — ask an admin" };
  }
  return { ok: true, session, coachProfileId };
}

async function mayActOnClassroom(session: CurrentSession, coachProfileId: string | null, classroomId: string) {
  if (isAdmin(session)) return true;
  if (!coachProfileId) return false;
  return isCoachAssignedToClassroom(session.tenantId, classroomId, coachProfileId);
}

/**
 * Returns a refusal when there are clashes the actor can't (or didn't) wave
 * through; null when the save may go ahead.
 */
function conflictGate(
  session: CurrentSession,
  conflicts: ScheduleConflict[],
  override: boolean
): CalendarActionResult | null {
  if (conflicts.length === 0) return null;
  if (override && isAdmin(session)) return null;
  return {
    ok: false,
    error: isAdmin(session)
      ? "This time clashes with other commitments. Review them, then save anyway if it's intended."
      : "This time clashes with other commitments. Pick another time, or ask an admin to override.",
    conflicts,
    canOverride: isAdmin(session),
  };
}

function translate(err: unknown): CalendarActionResult {
  if (err instanceof ConcurrentEditError) {
    return { ok: false, error: `${err.message}. Refresh the calendar and try again.` };
  }
  if (err instanceof TenantMismatchError) return { ok: false, error: "Not found in this academy" };
  if (err instanceof RecurrenceError) return { ok: false, error: err.message };
  throw err;
}

// ---------------------------------------------------------------------------
// Create a class
// ---------------------------------------------------------------------------

const CreateClassSchema = z.object({
  classroomId: Id,
  startLocal: LocalDateTime,
  timezone: Zone,
  durationMins: Duration,
  meetingUrl: z.string().max(500).optional(),
  recurrence: RecurrenceSchema,
  override: z.boolean().default(false),
});

export async function createCalendarClassAction(raw: unknown): Promise<CalendarActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff;
  const { session, coachProfileId } = staff;

  const parsed = CreateClassSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  if (!(await mayActOnClassroom(session, coachProfileId, input.classroomId))) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }

  let meetingUrl: string | null = null;
  if (input.meetingUrl?.trim()) {
    const link = parseMeetingUrl(input.meetingUrl);
    if (!link.ok) return { ok: false, error: link.error };
    meetingUrl = link.url;
  }

  try {
    if (input.recurrence.freq === "WEEKLY_ONGOING") {
      return await createOngoingWeekly(session, input, input.recurrence.weekdays);
    }

    const occurrences = expandRecurrence(input.startLocal, input.timezone, input.recurrence as Recurrence);
    if (occurrences.length === 0) return { ok: false, error: "That repeat rule produces no classes" };
    if (occurrences[0].startUtc.getTime() < Date.now() - 24 * 3_600_000) {
      return { ok: false, error: "That start time is in the past" };
    }

    const proposed = occurrences.map((o) => ({
      startUtc: o.startUtc,
      endUtc: new Date(o.startUtc.getTime() + input.durationMins * 60_000),
    }));
    const conflicts = await findScheduleConflicts(session.tenantId, { classroomId: input.classroomId, proposed });
    const refusal = conflictGate(session, conflicts, input.override);
    if (refusal) return refusal;

    const { count } = await createCalendarSessions(
      session.tenantId,
      {
        classroomId: input.classroomId,
        occurrences,
        durationMins: input.durationMins,
        timezone: input.timezone,
        meetingUrl,
      },
      {
        actorUserId: session.id,
        conflictOverride: conflicts.length > 0,
        conflictSummary: conflicts.length > 0 ? summarizeConflicts(conflicts) : null,
      }
    );
    revalidateSchedule(input.classroomId);
    return { ok: true, message: count === 1 ? "Class scheduled" : `${count} classes scheduled` };
  } catch (err) {
    return translate(err);
  }
}

async function createOngoingWeekly(
  session: CurrentSession,
  input: z.infer<typeof CreateClassSchema>,
  weekdays: number[]
): Promise<CalendarActionResult> {
  const start = DateTime.fromISO(input.startLocal, { zone: input.timezone });
  const slots = [...new Set(weekdays)].map((dayOfWeek) => ({
    dayOfWeek,
    localTime: start.toFormat("HH:mm"),
    timezone: input.timezone,
    durationMins: input.durationMins,
    startsOn: start.toFormat("yyyy-LL-dd"),
  }));

  // Checked over the same 8-week horizon the materializer fills.
  const proposed = slots.flatMap((slot) =>
    computeUpcomingOccurrencesUtc(slot).map((o) => ({
      startUtc: o.scheduledAtUtc,
      endUtc: new Date(o.scheduledAtUtc.getTime() + input.durationMins * 60_000),
    }))
  );
  const conflicts = await findScheduleConflicts(session.tenantId, { classroomId: input.classroomId, proposed });
  const refusal = conflictGate(session, conflicts, input.override);
  if (refusal) return refusal;

  let created = 0;
  for (const slot of slots) {
    const row = await createScheduleSlot(session.tenantId, input.classroomId, slot);
    created += (await materializeSlot(session.tenantId, row)).count;
  }
  revalidateSchedule(input.classroomId);
  return {
    ok: true,
    message: `Weekly class set up — ${created} upcoming ${created === 1 ? "class" : "classes"} on the calendar`,
  };
}

// ---------------------------------------------------------------------------
// Reschedule a class
// ---------------------------------------------------------------------------

const Scope = z.enum(["THIS", "FOLLOWING", "ALL"]);

const RescheduleSchema = z.object({
  sessionId: Id,
  version: z.string().datetime(),
  startLocal: LocalDateTime,
  timezone: Zone,
  durationMins: Duration,
  scope: Scope.default("THIS"),
  override: z.boolean().default(false),
});

export async function rescheduleClassAction(raw: unknown): Promise<CalendarActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff;
  const { session, coachProfileId } = staff;

  const parsed = RescheduleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  const live = await getSessionForCalendarEdit(session.tenantId, input.sessionId);
  if (!live) return { ok: false, error: "Class not found" };
  if (!isAdmin(session) && !live.classroom.coaches.some((c) => c.coachId === coachProfileId)) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }
  if (live.status === "CANCELLED") return { ok: false, error: "A cancelled class can't be rescheduled" };
  if (live.startedAtUtc || live._count.attendance > 0) {
    return { ok: false, error: "This class has already been held, so its time is part of the record" };
  }

  let toStartUtc: Date;
  try {
    toStartUtc = zonedLocalToUtc(input.startLocal, input.timezone);
  } catch {
    return { ok: false, error: "Choose a valid date and time" };
  }

  const slot = live.scheduleSlot && live.scheduleSlot.isActive && !live.scheduleSlot.deletedAt ? live.scheduleSlot : null;
  const series = live.scheduleSlotId
    ? ({ kind: "SLOT", id: live.scheduleSlotId } as const)
    : live.seriesId
      ? ({ kind: "SERIES", id: live.seriesId } as const)
      : null;
  const scope = series ? input.scope : "THIS";
  // The series' own zone decides what "same time next week" means.
  const zone = slot?.timezone ?? live.timezone ?? input.timezone;

  try {
    const siblings =
      scope === "THIS" || !series
        ? []
        : await listSeriesSessionsFrom(session.tenantId, series, scopeStart(scope, live.scheduledAtUtc, new Date()), {
            includeCancelled: true,
          });
    const plan = planSeriesMove({
      anchor: { ...live, version: new Date(input.version) },
      siblings,
      toStartUtc,
      toDurationMins: input.durationMins,
      zone,
    });

    const conflicts = await findScheduleConflicts(session.tenantId, {
      classroomId: live.classroomId,
      proposed: plan.moves.map((m) => ({
        startUtc: m.toStartUtc,
        endUtc: new Date(m.toStartUtc.getTime() + m.toDurationMins * 60_000),
      })),
      excludeSessionIds: plan.moves.map((m) => m.id),
    });
    const refusal = conflictGate(session, conflicts, input.override);
    if (refusal) return refusal;

    const audit = {
      actorUserId: session.id,
      conflictOverride: conflicts.length > 0,
      conflictSummary: conflicts.length > 0 ? summarizeConflicts(conflicts) : null,
    };

    if (scope !== "THIS" && slot) {
      // An open-ended weekly series: the template itself has to move, or the
      // nightly sweep keeps adding classes at the old time.
      const newSlot = await splitSlotSeries(
        session.tenantId,
        {
          oldSlotId: slot.id,
          newSlot: { ...plan.template, timezone: slot.timezone, durationMins: input.durationMins },
          moves: plan.moves,
          cancelledFollowers: plan.cancelled,
        },
        audit
      );
      await materializeSlot(session.tenantId, newSlot);
    } else {
      // A single occurrence keeps its slot link and occurrenceDate — that pair
      // is the materializer's idempotency key, so it won't re-create the class
      // at its old time. Finite series have no template to move.
      await rescheduleSessions(
        session.tenantId,
        plan.moves.map(({ occurrenceDate: _unused, ...m }) => m),
        audit
      );
    }

    revalidateSchedule(live.classroomId);
    const n = plan.moves.length;
    return { ok: true, message: n === 1 ? "Class rescheduled" : `${n} classes rescheduled` };
  } catch (err) {
    return translate(err);
  }
}

// ---------------------------------------------------------------------------
// Cancel a class
// ---------------------------------------------------------------------------

const CancelSchema = z.object({ sessionId: Id, scope: Scope.default("THIS") });

export async function cancelClassAction(raw: unknown): Promise<CalendarActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff;
  const { session, coachProfileId } = staff;

  const parsed = CancelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const live = await getSessionForCalendarEdit(session.tenantId, parsed.data.sessionId);
  if (!live) return { ok: false, error: "Class not found" };
  if (!isAdmin(session) && !live.classroom.coaches.some((c) => c.coachId === coachProfileId)) {
    return { ok: false, error: "You aren't assigned to this classroom" };
  }
  if (live.status === "CANCELLED") return { ok: false, error: "This class is already cancelled" };
  if (live.startedAtUtc || live._count.attendance > 0) {
    return { ok: false, error: "This class has already been held" };
  }

  const series = live.scheduleSlotId
    ? ({ kind: "SLOT", id: live.scheduleSlotId } as const)
    : live.seriesId
      ? ({ kind: "SERIES", id: live.seriesId } as const)
      : null;
  const scope = series ? parsed.data.scope : "THIS";

  const targets =
    scope === "THIS" || !series
      ? [live]
      : await listSeriesSessionsFrom(session.tenantId, series, scopeStart(scope, live.scheduledAtUtc, new Date()));
  if (!targets.some((t) => t.id === live.id)) targets.push(live);

  const count = await cancelSessions(
    session.tenantId,
    targets,
    { actorUserId: session.id },
    // Without retiring the template, the nightly sweep would put the series
    // straight back on the calendar.
    { retireSlotId: scope !== "THIS" && series?.kind === "SLOT" ? series.id : undefined }
  );
  revalidateSchedule(live.classroomId);
  return { ok: true, message: count === 1 ? "Class cancelled" : `${count} classes cancelled` };
}

// ---------------------------------------------------------------------------
// Holidays, blocked time, other entries
// ---------------------------------------------------------------------------

const BlockSchema = z.object({
  id: Id.optional(),
  version: z.string().datetime().optional(),
  kind: z.enum(["HOLIDAY", "UNAVAILABLE", "OTHER"]),
  title: z.string().trim().min(1, "Give it a title").max(120, "Title is too long"),
  description: z.string().trim().max(1000, "Description is too long").optional(),
  allDay: z.boolean(),
  // "yyyy-LL-ddTHH:mm"; for all-day entries only the date part is read and
  // the end date is inclusive.
  startLocal: LocalDateTime,
  endLocal: LocalDateTime,
  timezone: Zone,
  coachProfileId: Id.optional(),
  staffOnly: z.boolean().default(false),
});

function blockTimes(input: z.infer<typeof BlockSchema>): { startsAtUtc: Date; endsAtUtc: Date } | string {
  const parse = (v: string) => DateTime.fromISO(v, { zone: input.timezone });
  let start = parse(input.startLocal);
  let end = parse(input.endLocal);
  if (!start.isValid || !end.isValid) return "Choose valid dates";
  if (input.allDay) {
    start = start.startOf("day");
    end = end.startOf("day").plus({ days: 1 });
  }
  if (end <= start) return "The end must be after the start";
  if (end.diff(start, "days").days > 366) return "Entries can span at most a year";
  return { startsAtUtc: start.toUTC().toJSDate(), endsAtUtc: end.toUTC().toJSDate() };
}

export async function saveCalendarBlockAction(raw: unknown): Promise<CalendarActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff;
  const { session, coachProfileId } = staff;

  const parsed = BlockSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const input = parsed.data;

  // Holidays and academy entries are the admin's to set. A coach may only
  // block out their own time — the coach id is taken from the session, never
  // from the form.
  if (!isAdmin(session) && input.kind !== "UNAVAILABLE") {
    return { ok: false, error: "Only an academy admin can add holidays and academy events" };
  }
  const coachId = input.kind === "UNAVAILABLE" ? (isAdmin(session) ? input.coachProfileId : coachProfileId) : null;
  if (input.kind === "UNAVAILABLE" && !coachId) return { ok: false, error: "Choose whose time is blocked" };

  const times = blockTimes(input);
  if (typeof times === "string") return { ok: false, error: times };

  const data: BlockInput = {
    kind: input.kind,
    title: input.title,
    description: input.description || null,
    ...times,
    timezone: input.timezone,
    allDay: input.allDay,
    coachId: coachId ?? null,
    staffOnly: input.kind === "OTHER" ? input.staffOnly : input.kind === "UNAVAILABLE",
  };

  try {
    if (input.id) {
      const existing = await getCalendarBlock(session.tenantId, input.id);
      if (!existing) return { ok: false, error: "Entry not found" };
      if (!isAdmin(session) && (existing.kind !== "UNAVAILABLE" || existing.coachId !== coachProfileId)) {
        return { ok: false, error: "You can only edit your own blocked time" };
      }
      if (!input.version) return { ok: false, error: "Missing version — refresh and try again" };
      await updateCalendarBlock(session.tenantId, input.id, new Date(input.version), data);
    } else {
      await createCalendarBlock(session.tenantId, data, session.id);
    }
  } catch (err) {
    return translate(err);
  }
  revalidateSchedule();
  return { ok: true, message: input.id ? "Saved" : "Added to the calendar" };
}

export async function deleteCalendarBlockAction(raw: unknown): Promise<CalendarActionResult> {
  const staff = await requireStaff();
  if (!staff.ok) return staff;
  const { session, coachProfileId } = staff;

  const parsed = z.object({ id: Id }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const existing = await getCalendarBlock(session.tenantId, parsed.data.id);
  if (!existing) return { ok: false, error: "Entry not found" };
  if (!isAdmin(session) && (existing.kind !== "UNAVAILABLE" || existing.coachId !== coachProfileId)) {
    return { ok: false, error: "You can only remove your own blocked time" };
  }
  await deleteCalendarBlock(session.tenantId, existing.id);
  revalidateSchedule();
  return { ok: true, message: "Removed" };
}
