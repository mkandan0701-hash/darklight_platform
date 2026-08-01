import { beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateSocket, displayNameFromEmail } from "./authenticate";

const verifySupabaseJwt = vi.fn();
const findAppUserByAuthId = vi.fn();

vi.mock("../auth/verifySession", () => ({
  verifySupabaseJwt: (...args: unknown[]) => verifySupabaseJwt(...args),
}));
vi.mock("../repositories/liveSessionRepository", () => ({
  findAppUserByAuthId: (...args: unknown[]) => findAppUserByAuthId(...args),
}));
vi.mock("@chessplay-clone/db", () => ({
  runWithTenant: (_tenantId: string, fn: () => Promise<unknown>) => fn(),
}));

beforeEach(() => {
  verifySupabaseJwt.mockReset();
  findAppUserByAuthId.mockReset();
  verifySupabaseJwt.mockReturnValue({
    userId: "auth_1",
    tenantId: "tenant_1",
    role: "COACH",
  });
});

describe("displayNameFromEmail", () => {
  it("uses the local part so classmates' addresses aren't broadcast in chat", () => {
    expect(displayNameFromEmail("asha.rao@academy.test")).toBe("asha.rao");
  });

  it("falls back to the whole string when there is no local part", () => {
    expect(displayNameFromEmail("@academy.test")).toBe("@academy.test");
  });
});

describe("authenticateSocket", () => {
  it("rejects a missing token before doing any work", async () => {
    await expect(authenticateSocket(undefined)).rejects.toThrow("Missing auth token");
    expect(verifySupabaseJwt).not.toHaveBeenCalled();
  });

  it("rejects a token with no matching user row", async () => {
    findAppUserByAuthId.mockResolvedValue(null);
    await expect(authenticateSocket("jwt")).rejects.toThrow(
      "No matching account for this session"
    );
  });

  it("resolves the User row and exposes User.id, not the auth id", async () => {
    findAppUserByAuthId.mockResolvedValue({
      id: "user_1",
      email: "asha.rao@academy.test",
      role: "COACH",
    });

    const data = await authenticateSocket("jwt");

    expect(findAppUserByAuthId).toHaveBeenCalledWith("tenant_1", "auth_1");
    expect(data.appUser.id).toBe("user_1");
    expect(data.session.userId).toBe("auth_1");
    expect(data.displayName).toBe("asha.rao");
  });

  // A coach demoted to student must lose the reference board immediately,
  // not whenever their JWT happens to expire.
  it("prefers the database role over a stale role claim in the token", async () => {
    findAppUserByAuthId.mockResolvedValue({
      id: "user_1",
      email: "dev@academy.test",
      role: "STUDENT",
    });

    const data = await authenticateSocket("jwt");

    expect(data.session.role).toBe("STUDENT");
  });
});
