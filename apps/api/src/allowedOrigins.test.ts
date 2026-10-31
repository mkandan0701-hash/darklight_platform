import { describe, expect, it } from "vitest";
import { isAllowedOrigin, isUnconfigured, originPolicyFromEnv, type OriginPolicy } from "./allowedOrigins";

const prod: OriginPolicy = {
  rootDomain: "chessplayclone.com",
  extraOrigins: ["https://chessplay-demo.vercel.app"],
  allowLocalhost: false,
};

describe("isAllowedOrigin", () => {
  it("allows the root domain and academy subdomains over https", () => {
    expect(isAllowedOrigin("https://chessplayclone.com", prod)).toBe(true);
    expect(isAllowedOrigin("https://knights.chessplayclone.com", prod)).toBe(true);
  });

  it("refuses look-alike and foreign hosts", () => {
    expect(isAllowedOrigin("https://evilchessplayclone.com", prod)).toBe(false);
    expect(isAllowedOrigin("https://chessplayclone.com.evil.io", prod)).toBe(false);
    expect(isAllowedOrigin("https://example.com", prod)).toBe(false);
  });

  it("refuses plain http on the real domain", () => {
    expect(isAllowedOrigin("http://knights.chessplayclone.com", prod)).toBe(false);
  });

  it("allows exactly the listed extra origins", () => {
    expect(isAllowedOrigin("https://chessplay-demo.vercel.app", prod)).toBe(true);
    expect(isAllowedOrigin("https://other.vercel.app", prod)).toBe(false);
  });

  it("allows localhost only outside production", () => {
    expect(isAllowedOrigin("http://knights.localhost:3000", prod)).toBe(false);
    expect(isAllowedOrigin("http://knights.localhost:3000", { ...prod, allowLocalhost: true })).toBe(true);
  });

  it("lets non-browser clients (no Origin) through to authentication", () => {
    expect(isAllowedOrigin(undefined, prod)).toBe(true);
  });

  it("refuses a malformed origin", () => {
    expect(isAllowedOrigin("not a url", prod)).toBe(false);
  });
});

describe("originPolicyFromEnv", () => {
  it("reads the root domain and trims extra origins", () => {
    const policy = originPolicyFromEnv({
      NODE_ENV: "production",
      NEXT_PUBLIC_ROOT_DOMAIN: "ChessPlayClone.com",
      API_ALLOWED_ORIGINS: " https://a.vercel.app/ , ,https://b.example ",
    });
    expect(policy).toEqual({
      rootDomain: "chessplayclone.com",
      extraOrigins: ["https://a.vercel.app", "https://b.example"],
      allowLocalhost: false,
    });
    expect(isUnconfigured(policy)).toBe(false);
  });

  it("reports an empty configuration", () => {
    expect(isUnconfigured(originPolicyFromEnv({ NODE_ENV: "production" }))).toBe(true);
  });
});
