import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  }),
}));

import { config, middleware } from "./middleware";

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

  // Approximate — Next compiles the matcher with path-to-regexp, not RegExp —
  // but it catches the regression that matters: an asset falling back into the
  // matcher runs a Supabase getSession() round-trip and writes session cookies
  // onto a cacheable static file. Silent in dev, expensive in production.
  describe("matcher", () => {
    const matches = (pathname: string) =>
      new RegExp(`^${config.matcher[0]}$`).test(pathname);

    it("skips the vendored Stockfish assets", () => {
      expect(matches("/engine/stockfish-18-lite-single.wasm")).toBe(false);
      expect(matches("/engine/stockfish-18-lite-single.js")).toBe(false);
      expect(matches("/engine/COPYING.txt")).toBe(false);
    });

    it("still runs on app routes", () => {
      expect(matches("/dashboard")).toBe(true);
      expect(matches("/dashboard/play")).toBe(true);
      expect(matches("/login")).toBe(true);
      expect(matches("/")).toBe(true);
    });

    it("still skips Next's own static output", () => {
      expect(matches("/_next/static/chunks/main.js")).toBe(false);
      expect(matches("/favicon.ico")).toBe(false);
    });
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

  describe("DEMO_TENANT_SUBDOMAIN", () => {
    const originalDemo = process.env.DEMO_TENANT_SUBDOMAIN;

    afterEach(() => {
      if (originalDemo === undefined) delete process.env.DEMO_TENANT_SUBDOMAIN;
      else process.env.DEMO_TENANT_SUBDOMAIN = originalDemo;
    });

    const vercelRequest = (extraHeaders: Record<string, string> = {}) =>
      new NextRequest("https://chessplay-demo.vercel.app/dashboard", {
        headers: { host: "chessplay-demo.vercel.app", ...extraHeaders },
      });

    it("pins a vercel.app host to the demo tenant when set", async () => {
      process.env.DEMO_TENANT_SUBDOMAIN = "demo-academy";

      const response = await middleware(vercelRequest());

      expect(forwardedHeaders(response).get("x-tenant-subdomain")).toBe("demo-academy");
    });

    it("leaves a vercel.app host as apex when unset", async () => {
      delete process.env.DEMO_TENANT_SUBDOMAIN;

      const response = await middleware(vercelRequest());

      expect(forwardedHeaders(response).has("x-tenant-subdomain")).toBe(false);
    });

    it("never remaps the real root domain's apex", async () => {
      process.env.DEMO_TENANT_SUBDOMAIN = "demo-academy";
      const request = new NextRequest("https://chessplayclone.com/dashboard", {
        headers: { host: "chessplayclone.com" },
      });

      const response = await middleware(request);

      expect(forwardedHeaders(response).has("x-tenant-subdomain")).toBe(false);
    });

    it("does not override a real tenant subdomain", async () => {
      process.env.DEMO_TENANT_SUBDOMAIN = "demo-academy";
      const request = new NextRequest("https://academy1.chessplayclone.com/dashboard", {
        headers: { host: "academy1.chessplayclone.com" },
      });

      const response = await middleware(request);

      expect(forwardedHeaders(response).get("x-tenant-subdomain")).toBe("academy1");
    });

    it("overwrites a client-supplied header with the demo tenant", async () => {
      process.env.DEMO_TENANT_SUBDOMAIN = "demo-academy";

      const response = await middleware(
        vercelRequest({ "x-tenant-subdomain": "attacker-controlled-tenant" })
      );

      expect(forwardedHeaders(response).get("x-tenant-subdomain")).toBe("demo-academy");
    });
  });
});
