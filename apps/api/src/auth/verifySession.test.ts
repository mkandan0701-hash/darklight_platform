import { afterEach, beforeEach, describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";
import { verifySupabaseJwt } from "./verifySession";

const SECRET = "test-secret";

describe("verifySupabaseJwt", () => {
  const originalSecret = process.env.SUPABASE_JWT_SECRET;

  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.SUPABASE_JWT_SECRET = originalSecret;
  });

  it("returns an AuthedSession for a validly signed token with all claims", () => {
    const token = jwt.sign(
      { sub: "user_1", tenant_id: "tenant_1", role: "COACH" },
      SECRET
    );

    expect(verifySupabaseJwt(token)).toEqual({
      userId: "user_1",
      tenantId: "tenant_1",
      role: "COACH",
    });
  });

  it("throws if SUPABASE_JWT_SECRET is not set", () => {
    delete process.env.SUPABASE_JWT_SECRET;
    const token = jwt.sign(
      { sub: "user_1", tenant_id: "tenant_1", role: "COACH" },
      SECRET
    );

    expect(() => verifySupabaseJwt(token)).toThrow(
      "SUPABASE_JWT_SECRET is not set"
    );
  });

  it("throws on a token signed with the wrong secret", () => {
    const token = jwt.sign(
      { sub: "user_1", tenant_id: "tenant_1", role: "COACH" },
      "wrong-secret"
    );

    expect(() => verifySupabaseJwt(token)).toThrow();
  });

  it("throws when tenant_id claim is missing", () => {
    const token = jwt.sign({ sub: "user_1", role: "COACH" }, SECRET);

    expect(() => verifySupabaseJwt(token)).toThrow(
      "JWT is missing required tenant_id/role claims"
    );
  });

  it("throws when role claim is missing", () => {
    const token = jwt.sign({ sub: "user_1", tenant_id: "tenant_1" }, SECRET);

    expect(() => verifySupabaseJwt(token)).toThrow(
      "JWT is missing required tenant_id/role claims"
    );
  });

  it("throws when sub claim is missing", () => {
    const token = jwt.sign({ tenant_id: "tenant_1", role: "COACH" }, SECRET);

    expect(() => verifySupabaseJwt(token)).toThrow(
      "JWT is missing required tenant_id/role claims"
    );
  });
// Pinned to HS256. Another HMAC algorithm keyed with the same secret would
  // verify without the pin; "none" carries no signature at all.
  it("rejects a token signed with the right secret but another algorithm", () => {
    const token = jwt.sign({ sub: "user_1", tenant_id: "tenant_1", role: "COACH" }, SECRET, {
      algorithm: "HS512",
    });

    expect(() => verifySupabaseJwt(token)).toThrow(/invalid algorithm/);
  });

  it("rejects an unsigned token", () => {
    const token = jwt.sign({ sub: "user_1", tenant_id: "tenant_1", role: "COACH" }, "", {
      algorithm: "none",
    });

    expect(() => verifySupabaseJwt(token)).toThrow();
  });
});

