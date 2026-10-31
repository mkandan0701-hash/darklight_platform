import { describe, expect, it } from "vitest";
import type { CurrentSession } from "./session";
import { requireRole } from "./requireRole";
import { ForbiddenRoleError } from "./errors";

function sessionWithRole(role: CurrentSession["role"]): CurrentSession {
  return {
    id: "user_1",
    authProviderId: "auth_1",
    tenantId: "tenant_1",
    role,
    email: "user@example.com",
    displayName: null,
    timezone: "America/New_York",
    mustSetPassword: false,
  };
}

describe("requireRole", () => {
  it("allows a session whose role is in the allowed list", () => {
    expect(() => requireRole(sessionWithRole("ACADEMY_ADMIN"), ["ACADEMY_ADMIN"])).not.toThrow();
  });

  it("allows when the role matches any of several allowed roles", () => {
    expect(() =>
      requireRole(sessionWithRole("COACH"), ["ACADEMY_ADMIN", "COACH"])
    ).not.toThrow();
  });

  it("throws ForbiddenRoleError when the role isn't in the allowed list", () => {
    expect(() => requireRole(sessionWithRole("STUDENT"), ["ACADEMY_ADMIN"])).toThrow(
      ForbiddenRoleError
    );
  });

  it("throws for every role when the allowed list is empty", () => {
    expect(() => requireRole(sessionWithRole("ACADEMY_ADMIN"), [])).toThrow(
      ForbiddenRoleError
    );
  });

  it("denies a PARENT role from an ACADEMY_ADMIN-only action", () => {
    expect(() => requireRole(sessionWithRole("PARENT"), ["ACADEMY_ADMIN"])).toThrow(
      "Role PARENT is not permitted to perform this action"
    );
  });
});

describe("requireRoleOrNotFound", () => {
  // Regression: members/settings/puzzles answered a non-admin with HTTP 500.
  it("turns a wrong role into Next's not-found signal, not a ForbiddenRoleError", async () => {
    const { requireRoleOrNotFound } = await import("./requireRole");
    let thrown: unknown;
    try {
      requireRoleOrNotFound(sessionWithRole("STUDENT"), ["ACADEMY_ADMIN"]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect(thrown).not.toBeInstanceOf(ForbiddenRoleError);
    expect((thrown as { digest?: string }).digest).toBe("NEXT_NOT_FOUND");
  });

  it("lets an allowed role through", async () => {
    const { requireRoleOrNotFound } = await import("./requireRole");
    expect(() => requireRoleOrNotFound(sessionWithRole("ACADEMY_ADMIN"), ["ACADEMY_ADMIN"])).not.toThrow();
  });
});
