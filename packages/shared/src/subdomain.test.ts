import { describe, expect, it } from "vitest";
import { resolveSubdomain } from "./subdomain";

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
