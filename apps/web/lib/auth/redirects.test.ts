import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  safeNextPath,
  safeRedirectHost,
  DEFAULT_POST_AUTH_PATH,
} from "./redirects";

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

// The bug: NextRequest.nextUrl reports the server's own origin, so the auth
// callback redirected every invitee to the apex host. There the dashboard
// layout resolves no Tenant and redirects to /signup — someone who already
// has an academy gets told to create one.
describe("safeRedirectHost", () => {
  const ROOT = "chessplayclone.com";

  it("keeps the tenant subdomain the request arrived on", () => {
    expect(safeRedirectHost("academy1.chessplayclone.com", null, ROOT)).toBe(
      "academy1.chessplayclone.com"
    );
  });

  it("keeps a *.localhost tenant host in dev, port and all", () => {
    expect(safeRedirectHost("hdbgd.localhost:3000", null, ROOT)).toBe("hdbgd.localhost:3000");
  });

  it("keeps the apex host when that is genuinely where the request came in", () => {
    expect(safeRedirectHost("chessplayclone.com", null, ROOT)).toBe("chessplayclone.com");
  });

  it("prefers x-forwarded-host, which is the browser's host behind a proxy", () => {
    expect(safeRedirectHost("internal:8080", "academy1.chessplayclone.com", ROOT)).toBe(
      "academy1.chessplayclone.com"
    );
  });

  // Host is client-controlled. Building a redirect on it unchecked turns this
  // route into an open redirect that carries a freshly-authenticated session.
  it("refuses a host that is not ours rather than redirecting off-site", () => {
    expect(safeRedirectHost("evil.com", null, ROOT)).toBeNull();
    expect(safeRedirectHost("chessplayclone.com.evil.com", null, ROOT)).toBeNull();
    expect(safeRedirectHost("internal:8080", "evil.com", ROOT)).toBeNull();
  });

  it("returns null when there is no host at all", () => {
    expect(safeRedirectHost(null, null, ROOT)).toBeNull();
  });

  // Preview deploys have no {tenant}. form, so there is nothing to preserve.
  it("declines Vercel preview hosts", () => {
    expect(safeRedirectHost("my-app-abc123.vercel.app", null, ROOT)).toBeNull();
  });
});

describe("authErrorMessage", () => {
  it("maps known codes to their message", () => {
    expect(authErrorMessage("expired_link")).toMatch(/expired/i);
    expect(authErrorMessage("signin_required")).toMatch(/sign in/i);
  });

  // Signing in with an account from another academy used to reach the browser
  // as a blank 500 from the dashboard layout — a successful login that simply
  // died, with nothing on screen to explain it.
  it("explains a cross-academy sign-in instead of falling through to invalid_link", () => {
    const message = authErrorMessage("tenant_mismatch");
    expect(message).toMatch(/different academy/i);
    expect(message).not.toBe(authErrorMessage("invalid_link"));
  });

  // The account's real academy is knowable at the point of redirect, and
  // naming it would be friendlier — but it would have to travel in the query
  // string, which is the one thing the code-not-message rule forbids.
  it("does not name any academy, so nothing in the URL reaches the page as text", () => {
    expect(authErrorMessage("tenant_mismatch")).not.toMatch(/localhost|\.com|subdomain/i);
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
