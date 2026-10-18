import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@chessplay-clone/db";
import { materializeSlot } from "./scheduleSlotRepository";

/**
 * Proves the idempotency claim materializeSlot's write sequence depends on:
 * re-running it must never duplicate sessions, and must never resurrect a
 * session a coach has already cancelled. The unit tests mock Prisma, so they
 * can assert `skipDuplicates: true` was passed, but not that the
 * @@unique([scheduleSlotId, occurrenceDate]) constraint it relies on actually
 * holds against real Postgres.
 *
 * Needs DATABASE_URL pointing at a disposable database (the CI postgres
 * service). Never Supabase — see packages/db/testing/requireDisposableDatabase.ts.
 */

const RUN = randomUUID().slice(0, 8);
const tenantId = `sched-${RUN}`;

let classroomId = "";

beforeAll(async () => {
  await prismaBase.tenant.create({
    data: { id: tenantId, name: `Sched ${RUN}`, subdomain: `sched-${RUN}`, timezone: "UTC" },
  });
  const classroom = await prismaBase.classroom.create({
    data: { tenantId, name: "Slot room" },
  });
  classroomId = classroom.id;
});

afterAll(async () => {
  await prismaBase.liveSession.deleteMany({ where: { tenantId } });
  await prismaBase.classroomScheduleSlot.deleteMany({ where: { tenantId } });
  await prismaBase.classroom.deleteMany({ where: { tenantId } });
  await prismaBase.tenant.deleteMany({ where: { id: tenantId } });
  await prismaBase.$disconnect();
});

describe("materializeSlot", () => {
  it("is idempotent: a second call inserts nothing new", async () => {
    const slot = await prismaBase.classroomScheduleSlot.create({
      data: {
        tenantId,
        classroomId,
        dayOfWeek: 6,
        localTime: "10:00",
        timezone: "Asia/Kolkata",
        durationMins: 60,
      },
    });

    const first = await materializeSlot(tenantId, slot);
    expect(first.count).toBe(8);

    const second = await materializeSlot(tenantId, slot);
    expect(second.count).toBe(0);

    const rows = await prismaBase.liveSession.findMany({
      where: { tenantId, scheduleSlotId: slot.id },
    });
    expect(rows).toHaveLength(8);
  });

  it("does not resurrect a session a coach already cancelled on re-run", async () => {
    const slot = await prismaBase.classroomScheduleSlot.create({
      data: {
        tenantId,
        classroomId,
        dayOfWeek: 6,
        localTime: "10:00",
        timezone: "Asia/Kolkata",
        durationMins: 60,
      },
    });

    await materializeSlot(tenantId, slot);
    const rows = await prismaBase.liveSession.findMany({
      where: { tenantId, scheduleSlotId: slot.id },
      orderBy: { occurrenceDate: "asc" },
    });
    const [first] = rows;
    await prismaBase.liveSession.update({
      where: { id: first.id },
      data: { status: "CANCELLED" },
    });

    // Re-running materialization (as the nightly sweep or a second slot edit
    // would) must not touch the status of a row that already exists.
    await materializeSlot(tenantId, slot);
    const refetched = await prismaBase.liveSession.findUnique({ where: { id: first.id } });
    expect(refetched?.status).toBe("CANCELLED");
  });
});
