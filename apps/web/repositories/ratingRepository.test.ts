import { describe, expect, it, vi, beforeEach } from "vitest";

const studentFindFirst = vi.fn();
const ratingCreate = vi.fn();
const ratingFindMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    studentProfile: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    ratingRecord: {
      create: (...a: unknown[]) => ratingCreate(...a),
      findMany: (...a: unknown[]) => ratingFindMany(...a),
    },
  },
}));

const { recordRating, listRatingsForStudent, getLatestRatingByFederation } = await import(
  "./ratingRepository"
);

const baseInput = {
  tenantId: "tenant_1",
  studentId: "stu_1",
  federation: "FIDE" as const,
  rating: 1450,
  recordedByUserId: "user_1",
};

beforeEach(() => {
  [studentFindFirst, ratingCreate, ratingFindMany].forEach((m) => m.mockReset());
  studentFindFirst.mockResolvedValue(null);
  ratingFindMany.mockResolvedValue([]);
});

describe("recordRating", () => {
  it("refuses a student from another academy", async () => {
    await expect(recordRating(baseInput)).rejects.toThrow(/does not belong to this academy/);
    expect(ratingCreate).not.toHaveBeenCalled();
  });

  it("scopes the student lookup to the caller's tenant, then writes", async () => {
    studentFindFirst.mockResolvedValue({ id: "stu_1" });
    await recordRating(baseInput);
    expect(studentFindFirst.mock.calls[0][0].where).toEqual({
      id: "stu_1",
      tenantId: "tenant_1",
    });
    expect(ratingCreate).toHaveBeenCalledWith({ data: baseInput });
  });
});

describe("listRatingsForStudent", () => {
  it("scopes by tenant and student, newest first", async () => {
    await listRatingsForStudent("tenant_1", "stu_1");
    expect(ratingFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", studentId: "stu_1" },
      orderBy: { recordedAtUtc: "desc" },
    });
  });
});

describe("getLatestRatingByFederation", () => {
  it("keeps only the newest record per federation", async () => {
    ratingFindMany.mockResolvedValue([
      { id: "r1", federation: "FIDE", rating: 1500, recordedAtUtc: new Date("2026-06-01") },
      { id: "r2", federation: "FIDE", rating: 1400, recordedAtUtc: new Date("2026-01-01") },
      { id: "r3", federation: "USCF", rating: 1600, recordedAtUtc: new Date("2026-03-01") },
    ]);

    const latest = await getLatestRatingByFederation("tenant_1", "stu_1");
    expect(latest.get("FIDE")?.id).toBe("r1");
    expect(latest.get("USCF")?.id).toBe("r3");
    expect(latest.get("ECF")).toBeUndefined();
  });

  it("returns an empty map when the student has no ratings on file", async () => {
    ratingFindMany.mockResolvedValue([]);
    const latest = await getLatestRatingByFederation("tenant_1", "stu_1");
    expect(latest.size).toBe(0);
  });
});
