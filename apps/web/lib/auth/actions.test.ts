import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@chessplay-clone/db";

const tenantFindUnique = vi.fn();
vi.mock("@chessplay-clone/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chessplay-clone/db")>();
  return { Prisma: actual.Prisma, prisma: { tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) } } };
});

const createUser = vi.fn();
const deleteUser = vi.fn();
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    auth: { admin: { createUser: (...a: unknown[]) => createUser(...a), deleteUser: (...a: unknown[]) => deleteUser(...a) } },
  }),
}));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const createTenantWithAdmin = vi.fn();
vi.mock("../../repositories/tenantRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../repositories/tenantRepository")>();
  return {
    isSubdomainTakenError: actual.isSubdomainTakenError,
    createTenantWithAdmin: (...a: unknown[]) => createTenantWithAdmin(...a),
  };
});

const { signUpAcademy } = await import("./actions");

function form() {
  const fd = new FormData();
  const fields = {
    academyName: "Knight School",
    subdomain: "knight-school",
    timezone: "Asia/Kolkata",
    adminEmail: "coach@example.com",
    adminName: "Asha",
    adminPassword: "a-long-enough-password",
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function uniqueViolation(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

beforeEach(() => {
  tenantFindUnique.mockReset().mockResolvedValue(null);
  createUser.mockReset().mockResolvedValue({ data: { user: { id: "auth_1" } }, error: null });
  deleteUser.mockReset().mockResolvedValue({ error: null });
  createTenantWithAdmin.mockReset().mockResolvedValue({});
});

describe("signUpAcademy", () => {
  it("creates the tenant and admin through the single-transaction repository call", async () => {
    const result = await signUpAcademy(form());

    expect(result).toEqual({ ok: true, data: { subdomain: "knight-school" } });
    expect(createTenantWithAdmin).toHaveBeenCalledWith({
      tenant: { name: "Knight School", subdomain: "knight-school", timezone: "Asia/Kolkata" },
      admin: { email: "coach@example.com", displayName: "Asha", authProviderId: "auth_1" },
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a taken subdomain without creating an auth user", async () => {
    tenantFindUnique.mockResolvedValue({ id: "t_other" });

    const result = await signUpAcademy(form());

    expect(result).toEqual({ ok: false, error: "That subdomain is already taken" });
    expect(createUser).not.toHaveBeenCalled();
  });

  // Regression: a concurrent signup that won the race after our pre-check
  // surfaced as a generic "could not finish" error.
  it("maps a lost subdomain race to 'taken' and removes the auth user", async () => {
    createTenantWithAdmin.mockRejectedValue(uniqueViolation(["subdomain"]));

    const result = await signUpAcademy(form());

    expect(result).toEqual({ ok: false, error: "That subdomain is already taken" });
    expect(deleteUser).toHaveBeenCalledWith("auth_1");
  });

  it("removes the auth user when the database step fails for any other reason", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createTenantWithAdmin.mockRejectedValue(new Error("connection reset"));

    const result = await signUpAcademy(form());

    expect(result).toEqual({
      ok: false,
      error: "Could not finish setting up your academy. Please try again.",
    });
    expect(deleteUser).toHaveBeenCalledWith("auth_1");
  });

  it("does not treat a unique violation on another column as a taken subdomain", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createTenantWithAdmin.mockRejectedValue(uniqueViolation(["authProviderId"]));

    const result = await signUpAcademy(form());

    expect(result.ok).toBe(false);
    expect(result).not.toEqual({ ok: false, error: "That subdomain is already taken" });
  });
});
