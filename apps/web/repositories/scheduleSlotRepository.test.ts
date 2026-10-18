import { describe, expect, it, vi, beforeEach } from "vitest";

const classroomFindFirst = vi.fn();
const slotCreate = vi.fn();
const slotFindMany = vi.fn();
const slotFindFirst = vi.fn();
const slotUpdateMany = vi.fn();
const liveSessionCreateMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    classroom: { findFirst: (...a: unknown[]) => classroomFindFirst(...a) },
    classroomScheduleSlot: {
      create: (...a: unknown[]) => slotCreate(...a),
      findMany: (...a: unknown[]) => slotFindMany(...a),
      findFirst: (...a: unknown[]) => slotFindFirst(...a),
      updateMany: (...a: unknown[]) => slotUpdateMany(...a),
    },
    liveSession: { createMany: (...a: unknown[]) => liveSessionCreateMany(...a) },
  },
}));

const {
  createScheduleSlot,
  listActiveScheduleSlotsForClassroom,
  removeScheduleSlot,
  materializeSlot,
} = await import("./scheduleSlotRepository");

beforeEach(() => {
  [
    classroomFindFirst,
    slotCreate,
    slotFindMany,
    slotFindFirst,
    slotUpdateMany,
    liveSessionCreateMany,
  ].forEach((m) => m.mockReset());
  classroomFindFirst.mockResolvedValue(null);
  slotUpdateMany.mockResolvedValue({ count: 0 });
  liveSessionCreateMany.mockResolvedValue({ count: 0 });
});

// Same bug class as assignCoach/enrollStudent: the row carries the caller's
// own tenantId regardless of whose classroom this actually is.
describe("createScheduleSlot", () => {
  it("refuses a classroom from another academy", async () => {
    classroomFindFirst.mockResolvedValue(null);
    await expect(
      createScheduleSlot("tenant_1", "someone_elses", {
        dayOfWeek: 6,
        localTime: "10:00",
        timezone: "Asia/Kolkata",
        durationMins: 60,
      })
    ).rejects.toThrow(/does not belong to this academy/);
    expect(slotCreate).not.toHaveBeenCalled();
  });

  it("writes when the classroom belongs to the caller", async () => {
    classroomFindFirst.mockResolvedValue({ id: "c_1" });
    await createScheduleSlot("tenant_1", "c_1", {
      dayOfWeek: 6,
      localTime: "10:00",
      timezone: "Asia/Kolkata",
      durationMins: 60,
    });
    expect(slotCreate).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant_1",
        classroomId: "c_1",
        dayOfWeek: 6,
        localTime: "10:00",
        timezone: "Asia/Kolkata",
        durationMins: 60,
      },
    });
  });
});

describe("listActiveScheduleSlotsForClassroom", () => {
  it("scopes by tenant, classroom, and excludes inactive/soft-deleted rows", async () => {
    await listActiveScheduleSlotsForClassroom("tenant_1", "c_1");
    expect(slotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant_1", classroomId: "c_1", isActive: true, deletedAt: null },
      })
    );
  });
});

describe("removeScheduleSlot", () => {
  it("soft-deletes and deactivates rather than hard-deleting", async () => {
    slotUpdateMany.mockResolvedValue({ count: 1 });
    const result = await removeScheduleSlot("tenant_1", "slot_1");
    expect(result).toBe(true);
    const args = slotUpdateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: "slot_1", tenantId: "tenant_1" });
    expect(args.data.isActive).toBe(false);
    expect(args.data.deletedAt).toBeInstanceOf(Date);
  });

  it("returns false when nothing matched (wrong tenant or already gone)", async () => {
    slotUpdateMany.mockResolvedValue({ count: 0 });
    expect(await removeScheduleSlot("tenant_1", "slot_1")).toBe(false);
  });
});

describe("materializeSlot", () => {
  const slot = {
    id: "slot_1",
    classroomId: "c_1",
    dayOfWeek: 6,
    localTime: "10:00",
    timezone: "Asia/Kolkata",
    durationMins: 60,
  };

  it("generates 8 weeks of occurrences with skipDuplicates for idempotent re-runs", async () => {
    await materializeSlot("tenant_1", slot);
    const args = liveSessionCreateMany.mock.calls[0][0];
    expect(args.skipDuplicates).toBe(true);
    expect(args.data).toHaveLength(8);
    for (const row of args.data) {
      expect(row.tenantId).toBe("tenant_1");
      expect(row.classroomId).toBe("c_1");
      expect(row.scheduleSlotId).toBe("slot_1");
      expect(row.durationMins).toBe(60);
      expect(typeof row.occurrenceDate).toBe("string");
      expect(row.scheduledAtUtc).toBeInstanceOf(Date);
      expect(typeof row.socketRoomId).toBe("string");
    }
  });
});
