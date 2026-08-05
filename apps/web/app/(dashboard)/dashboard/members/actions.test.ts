import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantMismatchError } from "../../../../lib/auth/errors";

const getCurrentSession = vi.fn();
const linkParentToStudent = vi.fn();
const unlinkParentFromStudent = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: () => new Map() }));
vi.mock("../../../../repositories/userRepository", () => ({
  linkParentToStudent: (...a: unknown[]) => linkParentToStudent(...a),
  unlinkParentFromStudent: (...a: unknown[]) => unlinkParentFromStudent(...a),
  createUserWithProfile: vi.fn(),
  listTenantMembers: vi.fn(),
  listParentsAndStudents: vi.fn(),
  listParentStudentLinks: vi.fn(),
}));
vi.mock("../../../../repositories/tenantRepository", () => ({
  getTenantById: vi.fn(),
}));
vi.mock("../../../../lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

const { linkParentStudent, unlinkParentStudent } = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "a@x.test",
  timezone: "UTC",
});

function linkForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("parentProfileId", "parent_1");
  fd.set("studentProfileId", "student_1");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [getCurrentSession, linkParentToStudent, unlinkParentFromStudent].forEach((m) =>
    m.mockReset()
  );
  getCurrentSession.mockResolvedValue(sessionAs("ACADEMY_ADMIN"));
  linkParentToStudent.mockResolvedValue({ id: "ps_1" });
});

describe("linkParentStudent", () => {
  it("refuses anyone who isn't an academy admin", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("COACH"));
    expect(await linkParentStudent(linkForm())).toMatchObject({ ok: false });
    expect(linkParentToStudent).not.toHaveBeenCalled();
  });

  it("links for an admin", async () => {
    expect(await linkParentStudent(linkForm())).toEqual({ ok: true });
    expect(linkParentToStudent).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      parentProfileId: "parent_1",
      studentProfileId: "student_1",
    });
  });

  // The route boundary claude.md §7 describes: the repository refuses profile
  // ids from another academy, and this is what turns that into a message the
  // admin can act on rather than an unhandled 500.
  it("translates a cross-tenant refusal into a specific message", async () => {
    linkParentToStudent.mockRejectedValue(new TenantMismatchError("nope"));
    expect(await linkParentStudent(linkForm())).toEqual({
      ok: false,
      error: "That parent or student isn't part of your academy",
    });
  });

  // A tenant mismatch and a database failure are different situations; only
  // the first tells the admin something they can fix.
  it("still reports other failures generically", async () => {
    linkParentToStudent.mockRejectedValue(new Error("connection reset"));
    expect(await linkParentStudent(linkForm())).toEqual({
      ok: false,
      error: "Could not link this parent to this student",
    });
  });
});

describe("unlinkParentStudent", () => {
  it("refuses a non-admin", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("PARENT"));
    expect(await unlinkParentStudent("ps_1")).toMatchObject({ ok: false });
    expect(unlinkParentFromStudent).not.toHaveBeenCalled();
  });

  it("unlinks for an admin, scoped to their tenant", async () => {
    expect(await unlinkParentStudent("ps_1")).toEqual({ ok: true });
    expect(unlinkParentFromStudent).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      linkId: "ps_1",
    });
  });
});
