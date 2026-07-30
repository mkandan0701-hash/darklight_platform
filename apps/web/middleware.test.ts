import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  }),
}));

import { middleware } from "./middleware";

function forwardedHeaders(response: Response) {
  const overrideNames = (response.headers.get("x-middleware-override-headers") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const forwarded = new Map<string, string>();
  for (const name of overrideNames) {
    forwarded.set(name, response.headers.get(`x-middleware-request-${name}`) ?? "");
  }
  return forwarded;
}

describe("middleware", () => {
  const originalRootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "chessplayclone.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = originalRootDomain;
  });

  it("forwards the resolved tenant subdomain to downstream handlers", async () => {
    const request = new NextRequest("https://academy1.chessplayclone.com/dashboard", {
      headers: { host: "academy1.chessplayclone.com" },
    });

    const response = await middleware(request);

    expect(forwardedHeaders(response).get("x-tenant-subdomain")).toBe("academy1");
  });

  it("clears the tenant header on the apex domain", async () => {
    const request = new NextRequest("https://chessplayclone.com/", {
      headers: { host: "chessplayclone.com" },
    });

    const response = await middleware(request);

    expect(forwardedHeaders(response).has("x-tenant-subdomain")).toBe(false);
  });

  it("strips a client-supplied x-tenant-subdomain header instead of forwarding it verbatim", async () => {
    // A client claiming to be a different tenant than the Host header says.
    const request = new NextRequest("https://academy1.chessplayclone.com/dashboard", {
      headers: {
        host: "academy1.chessplayclone.com",
        "x-tenant-subdomain": "attacker-controlled-tenant",
      },
    });

    const response = await middleware(request);

    expect(forwardedHeaders(response).get("x-tenant-subdomain")).toBe("academy1");
  });

  it("drops a client-supplied x-tenant-subdomain header entirely on the apex domain", async () => {
    const request = new NextRequest("https://chessplayclone.com/", {
      headers: {
        host: "chessplayclone.com",
        "x-tenant-subdomain": "attacker-controlled-tenant",
      },
    });

    const response = await middleware(request);

    expect(forwardedHeaders(response).has("x-tenant-subdomain")).toBe(false);
  });
});
