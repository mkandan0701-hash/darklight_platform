import { describe, expect, it } from "vitest";
import {
  DEFAULT_TURN_TTL_SECONDS,
  mintTurnCredential,
  parseTurnUrls,
} from "./turnCredentials";

const NOW = new Date("2026-08-02T12:00:00.000Z");
const NOW_UNIX = Math.floor(NOW.getTime() / 1000);

describe("mintTurnCredential", () => {
  it("encodes the expiry and user in the username the relay parses", () => {
    const { username, expiresAtUnix } = mintTurnCredential({
      secret: "s3cret",
      userId: "user_1",
      ttlSeconds: 600,
      now: NOW,
    });
    expect(username).toBe(`${NOW_UNIX + 600}:user_1`);
    expect(expiresAtUnix).toBe(NOW_UNIX + 600);
  });

  it("defaults to an hour when no TTL is given", () => {
    const { expiresAtUnix } = mintTurnCredential({
      secret: "s3cret",
      userId: "user_1",
      now: NOW,
    });
    expect(expiresAtUnix).toBe(NOW_UNIX + DEFAULT_TURN_TTL_SECONDS);
  });

  // The relay recomputes this HMAC to verify, so it has to be reproducible
  // for identical inputs — a drift here silently breaks every connection.
  it("is deterministic for the same inputs", () => {
    const args = { secret: "s3cret", userId: "user_1", ttlSeconds: 600, now: NOW };
    expect(mintTurnCredential(args).credential).toBe(mintTurnCredential(args).credential);
  });

  it("changes with the secret, the user, and the expiry", () => {
    const base = { secret: "s3cret", userId: "user_1", ttlSeconds: 600, now: NOW };
    const credential = mintTurnCredential(base).credential;
    expect(mintTurnCredential({ ...base, secret: "other" }).credential).not.toBe(credential);
    expect(mintTurnCredential({ ...base, userId: "user_2" }).credential).not.toBe(credential);
    expect(mintTurnCredential({ ...base, ttlSeconds: 601 }).credential).not.toBe(credential);
  });

  it("produces a base64 credential", () => {
    const { credential } = mintTurnCredential({ secret: "s3cret", userId: "user_1", now: NOW });
    expect(credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  // A colon in the id would move where the relay thinks the expiry ends,
  // letting a crafted id change the credential's effective lifetime.
  it("strips colons from the user id so the expiry can't be shifted", () => {
    const { username } = mintTurnCredential({
      secret: "s3cret",
      userId: "9999999999:evil",
      ttlSeconds: 600,
      now: NOW,
    });
    expect(username).toBe(`${NOW_UNIX + 600}:9999999999_evil`);
    expect(username.split(":")).toHaveLength(2);
  });
});

describe("parseTurnUrls", () => {
  it("is empty when TURN isn't configured, so the feature stays inert", () => {
    expect(parseTurnUrls(undefined)).toEqual([]);
    expect(parseTurnUrls("")).toEqual([]);
    expect(parseTurnUrls("  ")).toEqual([]);
  });

  it("splits and trims a comma-separated list", () => {
    expect(parseTurnUrls("turn:a.example:3478 , turns:b.example:5349")).toEqual([
      "turn:a.example:3478",
      "turns:b.example:5349",
    ]);
  });
});
