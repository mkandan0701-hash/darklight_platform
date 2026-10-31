import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIN_PASSWORD_LENGTH, checkPasswordPair, passwordStrength } from "./passwordRules";

describe("checkPasswordPair", () => {
  it("accepts a matching pair at the minimum length", () => {
    const pw = "a".repeat(MIN_PASSWORD_LENGTH);
    expect(checkPasswordPair(pw, pw)).toEqual({});
  });

  it("flags a password one character short of the minimum", () => {
    const pw = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(checkPasswordPair(pw, pw).password).toMatch(/at least 8/);
  });

  it("flags a mismatch on the confirmation field, not the password", () => {
    const errors = checkPasswordPair("knight-fork-9", "knight-fork-8");
    expect(errors.password).toBeUndefined();
    expect(errors.confirmPassword).toMatch(/don't match/);
  });

  it("asks for the confirmation when it is empty", () => {
    expect(checkPasswordPair("knight-fork-9", "").confirmPassword).toMatch(/again/);
  });

  it("does not trim — a trailing space is a different password", () => {
    expect(checkPasswordPair("knight-fork-9 ", "knight-fork-9").confirmPassword).toBeDefined();
  });
});

describe("passwordStrength", () => {
  it("is empty for an empty field", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "" });
  });

  it("calls anything under the minimum too short, however varied", () => {
    expect(passwordStrength("aB3$").score).toBe(1);
  });

  it("rates a long lowercase-only password as merely okay", () => {
    expect(passwordStrength("checkmate").score).toBe(2);
  });

  it("rises with variety and length", () => {
    expect(passwordStrength("Checkmate12").score).toBe(3);
    expect(passwordStrength("Checkmate-in-12!").score).toBe(4);
  });
});

describe("server schema uses the shared minimum", () => {
  // actions.ts is a "use server" module that pulls in Prisma and Supabase, so
  // it can't be imported into a unit test. Reading its source is the cheapest
  // guard against someone re-inlining a literal that drifts from the UI hint.
  const source = readFileSync(join(__dirname, "actions.ts"), "utf8");

  it("has no hard-coded .min(8) left", () => {
    expect(source).not.toMatch(/\.min\(8\b/);
  });

  it("references MIN_PASSWORD_LENGTH for both signup and set-password", () => {
    expect(source.match(/\.min\(MIN_PASSWORD_LENGTH/g)?.length).toBe(2);
  });
});
