import { describe, expect, it } from "vitest";
import { AVATAR_IDENTITY_COUNT, avatarIdentity, hashSeed } from "./avatar";

describe("hashSeed", () => {
  it("is deterministic", () => {
    expect(hashSeed("user_1")).toBe(hashSeed("user_1"));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const seed of ["", "a", "user_1", "éèê", "x".repeat(500)]) {
      const h = hashSeed(seed);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("separates seeds that differ by one character", () => {
    expect(hashSeed("user_1")).not.toBe(hashSeed("user_2"));
  });
});

describe("avatarIdentity", () => {
  it("is deterministic across calls", () => {
    expect(avatarIdentity("user_1")).toEqual(avatarIdentity("user_1"));
  });

  // These are not checking the arithmetic — they are a tripwire. Changing the
  // hash or reordering PIECES/PALETTES silently re-rolls every avatar in the
  // product: a child who had a gold knight last week becomes a grey rook with
  // no migration and no error. If these fail, that is what happened, and it
  // needs to be a deliberate decision rather than a side effect.
  describe("pinned identities — a failure here means every avatar changed", () => {
    const vectors: [string, { piece: string; bg: string; motif: 0 | 1 }][] = [
      ["user_1", { piece: "q", bg: "#E4E2DA", motif: 1 }],
      ["cms7tc6xn000c5s9pcwaiffxn", { piece: "p", bg: "#E8F2EC", motif: 1 }],
      ["", { piece: "n", bg: "#E4E2DA", motif: 0 }],
      ["dev@demo-academy.test", { piece: "p", bg: "#E8F2EC", motif: 1 }],
    ];

    for (const [seed, expected] of vectors) {
      it(`${JSON.stringify(seed)} stays a ${expected.piece}`, () => {
        const identity = avatarIdentity(seed);
        expect(identity.piece).toBe(expected.piece);
        expect(identity.palette.bg).toBe(expected.bg);
        expect(identity.motif).toBe(expected.motif);
      });
    }
  });

  it("never throws on an empty or non-ASCII seed", () => {
    expect(() => avatarIdentity("")).not.toThrow();
    expect(() => avatarIdentity("आरव")).not.toThrow();
    expect(() => avatarIdentity("\u{1f600}")).not.toThrow();
  });

  it("always returns a palette drawn from the fixed set", () => {
    const identity = avatarIdentity("anything");
    expect(identity.palette.bg).toMatch(/^#[0-9A-F]{6}$/);
    expect(identity.palette.piece).toMatch(/^#[0-9A-F]{6}$/);
    expect(identity.palette.bg).not.toBe(identity.palette.piece);
  });

  describe("distribution", () => {
    const seeds = Array.from({ length: 1000 }, (_, i) => `cms${i.toString(36)}abcdefghij`);

    it("uses all six pieces, none dominating", () => {
      const counts = new Map<string, number>();
      for (const seed of seeds) {
        const { piece } = avatarIdentity(seed);
        counts.set(piece, (counts.get(piece) ?? 0) + 1);
      }
      expect(counts.size).toBe(6);
      // Even split is ~167. A correlated hash would spike one bucket.
      for (const [piece, n] of counts) {
        expect(n, `${piece} appeared ${n} times in 1000`).toBeGreaterThan(100);
        expect(n, `${piece} appeared ${n} times in 1000`).toBeLessThan(250);
      }
    });

    it("uses all eight palettes", () => {
      const seen = new Set(seeds.map((s) => avatarIdentity(s).palette.bg + avatarIdentity(s).palette.piece));
      expect(seen.size).toBe(8);
    });

    it("uses both motifs", () => {
      const seen = new Set(seeds.map((s) => avatarIdentity(s).motif));
      expect(seen).toEqual(new Set([0, 1]));
    });
  });

  it("reports how many distinct identities exist", () => {
    // Documented in the module comment as the basis for accepting collisions.
    expect(AVATAR_IDENTITY_COUNT).toBe(96);
  });
});
