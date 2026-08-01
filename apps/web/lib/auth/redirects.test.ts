import { describe, expect, it } from "vitest";
import { authErrorMessage, safeNextPath, DEFAULT_POST_AUTH_PATH } from "./redirects";

describe("safeNextPath", () => {
  it("keeps a rooted same-origin path", () => {
    expect(safeNextPath("/dashboard/homework")).toBe("/dashboard/homework");
  });

  it("falls back when next is absent or empty", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_POST_AUTH_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("rejects absolute URLs to another origin", () => {
    expect(safeNextPath("https://evil.com/steal")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("rejects protocol-relative URLs, which browsers resolve off-origin", () => {
    expect(safeNextPath("//evil.com/steal")).toBe(DEFAULT_POST_AUTH_PATH);
    expect(safeNextPath("/\\evil.com/steal")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("rejects a bare relative path", () => {
    expect(safeNextPath("dashboard")).toBe(DEFAULT_POST_AUTH_PATH);
  });

  it("uses the caller's fallback when one is given", () => {
    expect(safeNextPath("//evil.com", "/login")).toBe("/login");
  });
});

describe("authErrorMessage", () => {
  it("maps known codes to their message", () => {
    expect(authErrorMessage("expired_link")).toMatch(/expired/i);
    expect(authErrorMessage("signin_required")).toMatch(/sign in/i);
  });

  it("returns null when there is no error", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  it("never echoes an unknown code back to the page", () => {
    const message = authErrorMessage("<script>alert(1)</script>");
    expect(message).toBe(authErrorMessage("invalid_link"));
  });
});
