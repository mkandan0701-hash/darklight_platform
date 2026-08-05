import { describe, expect, it, vi, beforeEach } from "vitest";

const assignmentFindFirst = vi.fn();
const puzzleFindMany = vi.fn();
const assignmentCreate = vi.fn();
const assignmentPuzzleCreateMany = vi.fn();

const tx = {
  assignment: { create: (...a: unknown[]) => assignmentCreate(...a) },
  assignmentPuzzle: { createMany: (...a: unknown[]) => assignmentPuzzleCreateMany(...a) },
};

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    assignment: { findFirst: (...a: unknown[]) => assignmentFindFirst(...a) },
    puzzle: { findMany: (...a: unknown[]) => puzzleFindMany(...a) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

// The real visibleClassroomWhere, not a stub — these cases exist to prove the
// assignment read composes the same rule the classroom read enforces.
const { getAssignment, getAssignmentForViewer, createAssignment } = await import(
  "./assignmentRepository"
);

const viewer = (role: string) => ({ tenantId: "tenant_1", id: "user_1", role: role as never });

function whereOf() {
  const [args] = assignmentFindFirst.mock.calls[0] as [{ where: Record<string, any> }];
  return args.where;
}

beforeEach(() => {
  [assignmentFindFirst, puzzleFindMany, assignmentCreate, assignmentPuzzleCreateMany].forEach(
    (m) => m.mockReset()
  );
  assignmentFindFirst.mockResolvedValue(null);
  assignmentCreate.mockResolvedValue({ id: "a_1" });
  assignmentPuzzleCreateMany.mockResolvedValue({ count: 0 });
});

// The bug: the assignment detail page verified enrolment on its student branch
// but only role on its coach/admin branch, so any coach could open any
// assignment in the academy and read the completion table under it — every
// student's email and solved count for a class they don't teach.
describe("getAssignmentForViewer", () => {
  it("scopes by tenant and id", async () => {
    await getAssignmentForViewer(viewer("COACH"), "a_1");
    expect(whereOf()).toMatchObject({ id: "a_1", tenantId: "tenant_1" });
  });

  it("requires a COACH to be assigned to the assignment's classroom", async () => {
    await getAssignmentForViewer(viewer("COACH"), "a_1");
    expect(whereOf().classroom).toEqual({
      deletedAt: null,
      coaches: { some: { coach: { userId: "user_1" } } },
    });
  });

  it("reaches a PARENT's assignment only through their own child", async () => {
    await getAssignmentForViewer(viewer("PARENT"), "a_1");
    expect(whereOf().classroom).toEqual({
      deletedAt: null,
      students: {
        some: {
          student: {
            parents: { some: { parent: { userId: "user_1" }, deletedAt: null } },
          },
        },
      },
    });
  });

  it("never issues a query with no classroom filter at all", async () => {
    for (const role of ["ACADEMY_ADMIN", "COACH", "STUDENT", "PARENT"]) {
      assignmentFindFirst.mockClear();
      await getAssignmentForViewer(viewer(role), "a_1");
      expect(whereOf().classroom, `${role} has no classroom filter`).toBeDefined();
    }
  });

  it("still loads the roster the page's own enrolment check reads", async () => {
    await getAssignmentForViewer(viewer("STUDENT"), "a_1");
    const [args] = assignmentFindFirst.mock.calls[0] as [{ include: Record<string, any> }];
    expect(args.include.classroom).toEqual({ include: { students: true } });
    expect(args.include.puzzles).toEqual({ include: { puzzle: true } });
  });
});

// Pinning the deliberate asymmetry rather than leaving it to be "fixed" later:
// the attempt paths pass a studentId and check the roster for that exact
// student, which is stricter than membership, so routing them through the
// viewer filter would only add a weaker duplicate check.
describe("getAssignment", () => {
  it("stays tenant-scoped only, for callers that do their own roster check", async () => {
    await getAssignment("tenant_1", "a_1");
    expect(whereOf()).toEqual({ id: "a_1", tenantId: "tenant_1" });
  });
});

// Puzzle is exempt from the tenant-scoping guard because it mixes global
// LICHESS rows (tenantId null) with private UPLOAD ones, so nothing else stops
// a coach from assigning another academy's uploaded set by id.
describe("createAssignment puzzle ownership", () => {
  const input = {
    classroomId: "c_1",
    title: "Week 1",
    dueAtUtc: null,
    puzzleIds: ["p_1", "p_2"],
  };

  it("accepts only global puzzles or this tenant's own uploads", async () => {
    puzzleFindMany.mockResolvedValue([{ id: "p_1" }, { id: "p_2" }]);
    await createAssignment("tenant_1", input);

    const [args] = puzzleFindMany.mock.calls[0] as [{ where: Record<string, any> }];
    expect(args.where.id).toEqual({ in: ["p_1", "p_2"] });
    // Exactly the rule listAssignablePuzzles offers the picker.
    expect(args.where.OR).toEqual([{ tenantId: null }, { tenantId: "tenant_1" }]);
  });

  // Refusing wholesale rather than dropping the offenders: a coach who picked
  // ten puzzles and silently got six would only find out from a student.
  it("refuses the whole assignment when any puzzle is another academy's", async () => {
    puzzleFindMany.mockResolvedValue([{ id: "p_1" }]);
    await expect(createAssignment("tenant_1", input)).rejects.toThrow(
      /not available to this academy/
    );
    expect(assignmentCreate).not.toHaveBeenCalled();
  });

  it("creates when every puzzle resolves", async () => {
    puzzleFindMany.mockResolvedValue([{ id: "p_1" }, { id: "p_2" }]);
    await createAssignment("tenant_1", input);
    expect(assignmentCreate).toHaveBeenCalled();
    expect(assignmentPuzzleCreateMany).toHaveBeenCalled();
  });

  // Counting distinct ids matters: ["p_1","p_1"] requests two but can only
  // ever match one row, so a length comparison would reject a legitimate
  // duplicate — and, worse, ["p_1","foreign"] could pass a naive count.
  it("counts distinct ids rather than raw length", async () => {
    puzzleFindMany.mockResolvedValue([{ id: "p_1" }]);
    await expect(
      createAssignment("tenant_1", { ...input, puzzleIds: ["p_1", "p_1"] })
    ).resolves.toBeDefined();
  });

  it("skips the lookup entirely for an assignment with no puzzles", async () => {
    await createAssignment("tenant_1", { ...input, puzzleIds: [] });
    expect(puzzleFindMany).not.toHaveBeenCalled();
    expect(assignmentCreate).toHaveBeenCalled();
  });
});
