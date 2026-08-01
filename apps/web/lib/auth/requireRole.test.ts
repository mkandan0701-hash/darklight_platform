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
