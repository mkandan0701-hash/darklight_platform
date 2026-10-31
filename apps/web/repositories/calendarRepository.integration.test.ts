import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { prismaBase } from "@chessplay-clone/db";
import {
  cancelSessions,
  createCalendarSessions,
  findScheduleConflicts,
  listCalendarEvents,
  listSeriesSessionsFrom,
  rescheduleSessions,
  splitSlotSeries,
  type CalendarViewer,
} from "./calendarRepository";
import { materializeSlot } from "./scheduleSlotRepository";
import { planSeriesMove } from "../lib/calendar/seriesEdit";

/**
 * The calendar's central promise, against real Postgres: one LiveSession row,
 * visible to exactly the people on its classroom's roster, so creating,
 * moving or cancelling it shows up for all of them and for nobody else.
 * The unit tests pin query shapes; this proves the shapes select the right
 * rows.
 *
 * Needs DATABASE_URL pointing at a disposable database (the CI postgres
 * service). Never Supabase — see packages/db/testing/requireDisposableDatabase.ts.
 */

const RUN = randomUUID().slice(0, 8);
const tenantId = `cal-${RUN}`;
const range = {
  startUtc: DateTime.now().minus({ days: 1 }).toJSDate(),
  endUtc: DateTime.now().plus({ weeks: 12 }).toJSDate(),
};

type Ids = { userId: string; profileId: string };
const people: Record<string, Ids> = {};
let roomId = "";

async function person(key: string, role: "ACADEMY_ADMIN" | "COACH" | "STUDENT" | "PARENT") {
  const user = await prismaBase.user.create({
    data: {
      tenantId,
      email: `${key}-${RUN}@cal.test`,
      displayName: key,
      role,
      timezone: "Asia/Kolkata",
      authProviderId: `cal-${key}-${RUN}`,
    },
  });
  let profileId = "";
  if (role === "COACH") profileId = (await prismaBase.coachProfile.create({ data: { userId: user.id, tenantId } })).id;
  if (role === "STUDENT") profileId = (await prismaBase.studentProfile.create({ data: { userId: user.id, tenantId } })).id;
  if (role === "PARENT") profileId = (await prismaBase.parentProfile.create({ data: { userId: user.id, tenantId } })).id;
  people[key] = { userId: user.id, profileId };
}

const viewer = (key: string, role: CalendarViewer["role"]): CalendarViewer => ({
  tenantId,
  id: people[key].userId,
  role,
  coachProfileId: role === "COACH" ? people[key].profileId : null,
});

const classIds = async (v: CalendarViewer, studentProfileId?: string) =>
  (await listCalendarEvents(v, studentProfileId ? { studentProfileId } : {}, range))
    .filter((e) => e.category === "CLASS")
    .map((e) => e.sourceId);

beforeAll(async () => {
  await prismaBase.tenant.create({
    data: { id: tenantId, name: `Cal ${RUN}`, subdomain: `cal-${RUN}`, timezone: "Asia/Kolkata" },
  });
  await person("admin", "ACADEMY_ADMIN");
  await person("coachA", "COACH");
  await person("coachZ", "COACH");
  await person("studentB", "STUDENT");
  await person("studentC", "STUDENT");
  await person("studentD", "STUDENT");
  await person("parentP", "PARENT");
  await person("parentQ", "PARENT");

  const room = await prismaBase.classroom.create({ data: { tenantId, name: "Saturday Juniors" } });
  roomId = room.id;
  await prismaBase.classroomCoach.create({ data: { tenantId, classroomId: roomId, coachId: people.coachA.profileId } });
  await prismaBase.classroomStudent.create({ data: { tenantId, classroomId: roomId, studentId: people.studentB.profileId } });
  await prismaBase.parentStudent.create({
    data: { tenantId, parentId: people.parentP.profileId, studentId: people.studentB.profileId },
  });
  await prismaBase.parentStudent.create({
    data: { tenantId, parentId: people.parentQ.profileId, studentId: people.studentC.profileId },
  });
});

afterAll(async () => {
  await prismaBase.liveSessionChange.deleteMany({ where: { tenantId } });
  await prismaBase.liveSession.deleteMany({ where: { tenantId } });
  await prismaBase.calendarBlock.deleteMany({ where: { tenantId } });
  await prismaBase.classroomScheduleSlot.deleteMany({ where: { tenantId } });
  await prismaBase.classroomStudent.deleteMany({ where: { tenantId } });
  await prismaBase.classroomCoach.deleteMany({ where: { tenantId } });
  await prismaBase.classroom.deleteMany({ where: { tenantId } });
  await prismaBase.parentStudent.deleteMany({ where: { tenantId } });
  await prismaBase.coachProfile.deleteMany({ where: { tenantId } });
  await prismaBase.studentProfile.deleteMany({ where: { tenantId } });
  await prismaBase.parentProfile.deleteMany({ where: { tenantId } });
  await prismaBase.user.deleteMany({ where: { tenantId } });
  await prismaBase.tenant.deleteMany({ where: { id: tenantId } });
  await prismaBase.$disconnect();
});

describe("one class, every authorized calendar", () => {
  let sessionId = "";

  it("admin creates a class; admin, coach, student and the student's parent all see it", async () => {
    const start = DateTime.now().plus({ days: 3 }).set({ hour: 18, minute: 0, second: 0, millisecond: 0 });
    await createCalendarSessions(
      tenantId,
      { classroomId: roomId, occurrences: [{ startUtc: start.toJSDate() }], durationMins: 60, timezone: "Asia/Kolkata", meetingUrl: null },
      { actorUserId: people.admin.userId }
    );
    const [row] = await prismaBase.liveSession.findMany({ where: { tenantId, classroomId: roomId } });
    sessionId = row.id;

    expect(await classIds(viewer("admin", "ACADEMY_ADMIN"))).toContain(sessionId);
    expect(await classIds(viewer("coachA", "COACH"))).toContain(sessionId);
    expect(await classIds(viewer("studentB", "STUDENT"), people.studentB.profileId)).toContain(sessionId);
    expect(await classIds(viewer("parentP", "PARENT"), people.studentB.profileId)).toContain(sessionId);
  });

  it("an unrelated student, another coach and another family see nothing", async () => {
    expect(await classIds(viewer("studentC", "STUDENT"), people.studentC.profileId)).not.toContain(sessionId);
    expect(await classIds(viewer("coachZ", "COACH"))).not.toContain(sessionId);
    expect(await classIds(viewer("parentQ", "PARENT"), people.studentC.profileId)).not.toContain(sessionId);
    // A parent asking for someone else's child gets the intersection: nothing.
    expect(await classIds(viewer("parentQ", "PARENT"), people.studentB.profileId)).not.toContain(sessionId);
  });

  it("a reschedule shows the same new time to everyone, labelled", async () => {
    const row = await prismaBase.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
    const to = new Date(row.scheduledAtUtc.getTime() + 24 * 3_600_000);
    await rescheduleSessions(
      tenantId,
      [{ id: sessionId, expectedVersion: row.updatedAt, fromStartUtc: row.scheduledAtUtc, fromDurationMins: 60, toStartUtc: to, toDurationMins: 90 }],
      { actorUserId: people.coachA.userId }
    );
    for (const [v, scope] of [
      [viewer("coachA", "COACH"), {}],
      [viewer("studentB", "STUDENT"), { studentProfileId: people.studentB.profileId }],
    ] as const) {
      const e = (await listCalendarEvents(v, scope, range)).find((x) => x.sourceId === sessionId)!;
      expect(e.startUtc).toBe(to.toISOString());
      expect(e.durationMins).toBe(90);
      expect(e.rescheduled).toBe(true);
    }
  });

  it("a stale editor can't overwrite that reschedule", async () => {
    const row = await prismaBase.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
    await expect(
      rescheduleSessions(
        tenantId,
        [{ id: sessionId, expectedVersion: new Date(0), fromStartUtc: row.scheduledAtUtc, fromDurationMins: 90, toStartUtc: row.scheduledAtUtc, toDurationMins: 30 }],
        { actorUserId: people.admin.userId }
      )
    ).rejects.toThrow("changed or cancelled");
  });

  it("the coach and student are now busy then — a clashing class is detected", async () => {
    const row = await prismaBase.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
    const other = await prismaBase.classroom.create({ data: { tenantId, name: "Endgames" } });
    await prismaBase.classroomCoach.create({ data: { tenantId, classroomId: other.id, coachId: people.coachA.profileId } });
    const conflicts = await findScheduleConflicts(tenantId, {
      classroomId: other.id,
      proposed: [{ startUtc: row.scheduledAtUtc, endUtc: new Date(row.scheduledAtUtc.getTime() + 3_600_000) }],
    });
    expect(conflicts.map((c) => c.reason)).toContain("COACH");
  });

  it("a newly enrolled student sees the class without anything being copied", async () => {
    expect(await classIds(viewer("studentD", "STUDENT"), people.studentD.profileId)).not.toContain(sessionId);
    await prismaBase.classroomStudent.create({ data: { tenantId, classroomId: roomId, studentId: people.studentD.profileId } });
    expect(await classIds(viewer("studentD", "STUDENT"), people.studentD.profileId)).toContain(sessionId);
  });

  it("a cancellation reaches every participant", async () => {
    const row = await prismaBase.liveSession.findUniqueOrThrow({ where: { id: sessionId } });
    await cancelSessions(tenantId, [row], { actorUserId: people.admin.userId });
    const e = (await listCalendarEvents(viewer("parentP", "PARENT"), { studentProfileId: people.studentB.profileId }, range)).find(
      (x) => x.sourceId === sessionId
    );
    expect(e?.status).toBe("CANCELLED");
    const audit = await prismaBase.liveSessionChange.findMany({ where: { liveSessionId: sessionId }, orderBy: { createdAtUtc: "asc" } });
    expect(audit.map((a) => a.kind)).toEqual(["CREATED", "RESCHEDULED", "CANCELLED"]);
  });
});

describe("splitting an ongoing weekly series", () => {
  it("moves this-and-following without duplicating or resurrecting any week", async () => {
    const zone = "Asia/Kolkata";
    const slot = await prismaBase.classroomScheduleSlot.create({
      data: { tenantId, classroomId: roomId, dayOfWeek: 6, localTime: "10:00", timezone: zone, durationMins: 60 },
    });
    await materializeSlot(tenantId, slot);
    const weeks = await prismaBase.liveSession.findMany({ where: { scheduleSlotId: slot.id }, orderBy: { scheduledAtUtc: "asc" } });
    expect(weeks).toHaveLength(8);
    await prismaBase.liveSession.update({ where: { id: weeks[4].id }, data: { status: "CANCELLED" } });

    // Move week 3 onwards to Sunday 11:30.
    const anchor = weeks[2];
    const to = DateTime.fromJSDate(anchor.scheduledAtUtc, { zone }).plus({ days: 1 }).set({ hour: 11, minute: 30 });
    const siblings = await listSeriesSessionsFrom(tenantId, { kind: "SLOT", id: slot.id }, anchor.scheduledAtUtc, { includeCancelled: true });
    const plan = planSeriesMove({
      anchor: { ...anchor, version: anchor.updatedAt },
      siblings,
      toStartUtc: to.toUTC().toJSDate(),
      toDurationMins: 60,
      zone,
    });
    const newSlot = await splitSlotSeries(
      tenantId,
      { oldSlotId: slot.id, newSlot: { ...plan.template, timezone: zone, durationMins: 60 }, moves: plan.moves, cancelledFollowers: plan.cancelled },
      { actorUserId: people.admin.userId }
    );
    // The follow-up top-up (and any number of nightly re-runs) adds only
    // weeks beyond the original horizon.
    await materializeSlot(tenantId, newSlot);
    await materializeSlot(tenantId, newSlot);

    const all = await prismaBase.liveSession.findMany({
      where: { tenantId, scheduleSlotId: { in: [slot.id, newSlot.id] } },
      orderBy: { scheduledAtUtc: "asc" },
    });
    const days = all.map((s) => DateTime.fromJSDate(s.scheduledAtUtc, { zone }).toFormat("ccc HH:mm"));
    expect(days.slice(0, 2)).toEqual(["Sat 10:00", "Sat 10:00"]); // untouched
    expect(days.slice(2).every((d) => d === "Sun 11:30")).toBe(true);
    // Exactly one class per week: no week duplicated.
    const dates = all.map((s) => DateTime.fromJSDate(s.scheduledAtUtc, { zone }).startOf("week").toISODate());
    expect(new Set(dates).size).toBe(dates.length);
    // The cancelled week stayed cancelled.
    expect((await prismaBase.liveSession.findUniqueOrThrow({ where: { id: weeks[4].id } })).status).toBe("CANCELLED");
    expect((await prismaBase.classroomScheduleSlot.findUniqueOrThrow({ where: { id: slot.id } })).isActive).toBe(false);
  });
});
