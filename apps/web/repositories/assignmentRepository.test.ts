import { describe, expect, it, vi, beforeEach } from "vitest";

const assignmentFindFirst = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    assignment: { findFirst: (...a: unknown[]) => assignmentFindFirst(...a) },
  },
}));

// The real visibleClassroomWhere, not a stub — these cases exist to prove the
// assignment read composes the same rule the classroom read enforces.
const { getAssignment, getAssignmentForViewer } = await import("./assignmentRepository");

const viewer = (role: string) => ({ tenantId: "tenant_1", id: "user_1", role: role as never });

function whereOf() {
  const [args] = assignmentFindFirst.mock.calls[0] as [{ where: Record<string, any> }];
  return args.where;
}

beforeEach(() => {
  assignmentFindFirst.mockReset();
  assignmentFindFirst.mockResolvedValue(null);
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
      students: { some: { student: { parents: { some: { parent: { userId: "user_1" } } } } } },
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
