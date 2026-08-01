import { describe, expect, it } from "vitest";
import { resolveSubdomain, tenantApexHost, tenantUrl } from "./subdomain";

const ROOT = "chessplayclone.com";

describe("resolveSubdomain", () => {
  it("treats bare localhost as apex", () => {
    expect(resolveSubdomain("localhost", ROOT)).toEqual({ type: "apex" });
    expect(resolveSubdomain("localhost:3000", ROOT)).toEqual({ type: "apex" });
  });

  it("treats *.localhost as a tenant candidate", () => {
    expect(resolveSubdomain("demoacademy.localhost:3000", ROOT)).toEqual({
      type: "tenant",
      subdomain: "demoacademy",
    });
  });

  it("treats *.vercel.app as apex", () => {
    expect(resolveSubdomain("my-app-git-main-team.vercel.app", ROOT)).toEqual({ type: "apex" });
  });

  it("treats the root domain and its www. variant as apex", () => {
    expect(resolveSubdomain(ROOT, ROOT)).toEqual({ type: "apex" });
    expect(resolveSubdomain(`www.${ROOT}`, ROOT)).toEqual({ type: "apex" });
  });

  it("treats a real tenant subdomain as tenant", () => {
    expect(resolveSubdomain(`demoacademy.${ROOT}`, ROOT)).toEqual({
      type: "tenant",
      subdomain: "demoacademy",
    });
  });

  it("treats a reserved word subdomain as reserved", () => {
    expect(resolveSubdomain(`app.${ROOT}`, ROOT)).toEqual({
      type: "reserved",
      subdomain: "app",
    });
  });

  it("treats an unrecognized host as apex", () => {
    expect(resolveSubdomain("totally-unrelated.example.org", ROOT)).toEqual({ type: "apex" });
  });

  it("treats an empty host as apex", () => {
    expect(resolveSubdomain("", ROOT)).toEqual({ type: "apex" });
  });

  it("treats a multi-label prefix as apex, not a tenant", () => {
    expect(resolveSubdomain(`foo.bar.${ROOT}`, ROOT)).toEqual({ type: "apex" });
  });

  it("treats apex as apex when root domain isn't configured", () => {
    expect(resolveSubdomain("demoacademy.example.com", "")).toEqual({ type: "apex" });
  });
});

describe("tenantApexHost", () => {
  it("strips an existing tenant label", () => {
    expect(tenantApexHost(`academy1.${ROOT}`, ROOT)).toBe(ROOT);
  });

  it("returns the apex unchanged", () => {
    expect(tenantApexHost(ROOT, ROOT)).toBe(ROOT);
    expect(tenantApexHost(`www.${ROOT}`, ROOT)).toBe(ROOT);
  });

  it("preserves the port in local dev", () => {
    expect(tenantApexHost("localhost:3000", ROOT)).toBe("localhost:3000");
    expect(tenantApexHost("academy1.localhost:3000", ROOT)).toBe("localhost:3000");
  });

  it("has no apex for preview deployments", () => {
    expect(tenantApexHost("my-app-git-main-team.vercel.app", ROOT)).toBeNull();
  });

  it("has no apex for unrecognized or unconfigured hosts", () => {
    expect(tenantApexHost("totally-unrelated.example.org", ROOT)).toBeNull();
    expect(tenantApexHost(`academy1.${ROOT}`, "")).toBeNull();
    expect(tenantApexHost("", ROOT)).toBeNull();
  });
});

describe("tenantUrl", () => {
  it("builds an https URL on the target tenant's host in production", () => {
    expect(
      tenantUrl({
        host: `academy1.${ROOT}`,
        rootDomain: ROOT,
        subdomain: "academy2",
        path: "/auth/callback",
      })
    ).toBe(`https://academy2.${ROOT}/auth/callback`);
  });

  it("builds an http URL with the dev port from the apex host", () => {
    expect(
      tenantUrl({
        host: "localhost:3000",
        rootDomain: ROOT,
        subdomain: "academy1",
        path: "/auth/callback",
      })
    ).toBe("http://academy1.localhost:3000/auth/callback");
  });

  it("honours a forwarded protocol, with or without a trailing colon", () => {
    const base = { host: ROOT, rootDomain: ROOT, subdomain: "academy1", path: "/auth/callback" };
    expect(tenantUrl({ ...base, protocol: "http" })).toBe(
      `http://academy1.${ROOT}/auth/callback`
    );
    expect(tenantUrl({ ...base, protocol: "https:" })).toBe(
      `https://academy1.${ROOT}/auth/callback`
    );
  });

  it("takes the outermost hop from a chained x-forwarded-proto", () => {
    expect(
      tenantUrl({
        host: ROOT,
        rootDomain: ROOT,
        subdomain: "academy1",
        path: "/auth/callback",
        protocol: "https,http",
      })
    ).toBe(`https://academy1.${ROOT}/auth/callback`);
  });

  it("roots a path that was passed without a leading slash", () => {
    expect(
      tenantUrl({ host: ROOT, rootDomain: ROOT, subdomain: "academy1", path: "auth/callback" })
    ).toBe(`https://academy1.${ROOT}/auth/callback`);
  });

  it("returns null when the host can't carry tenant subdomains", () => {
    expect(
      tenantUrl({
        host: "my-app-git-main-team.vercel.app",
        rootDomain: ROOT,
        subdomain: "academy1",
        path: "/auth/callback",
      })
    ).toBeNull();
  });

  it("returns null when no subdomain is given", () => {
    expect(
      tenantUrl({ host: ROOT, rootDomain: ROOT, subdomain: "", path: "/auth/callback" })
    ).toBeNull();
  });
});
