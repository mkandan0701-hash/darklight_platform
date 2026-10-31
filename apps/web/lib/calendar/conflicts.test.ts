import { describe, expect, it } from "vitest";
import { MAX_REPORTED_CONFLICTS, matchConflicts, overlaps, summarizeConflicts, type ConflictCandidate } from "./conflicts";

const d = (iso: string) => new Date(iso);

describe("overlaps", () => {
  it("treats back-to-back classes as not clashing", () => {
    expect(overlaps(d("2026-10-17T10:00Z"), d("2026-10-17T11:00Z"), d("2026-10-17T11:00Z"), d("2026-10-17T12:00Z"))).toBe(false);
  });
  it("catches a partial overlap and full containment", () => {
    expect(overlaps(d("2026-10-17T10:00Z"), d("2026-10-17T11:00Z"), d("2026-10-17T10:59Z"), d("2026-10-17T12:00Z"))).toBe(true);
    expect(overlaps(d("2026-10-17T09:00Z"), d("2026-10-17T13:00Z"), d("2026-10-17T10:00Z"), d("2026-10-17T11:00Z"))).toBe(true);
  });
});

describe("matchConflicts", () => {
  const coachClash: ConflictCandidate = {
    reason: "COACH",
    who: "Priya",
    what: "Saturday Juniors",
    startUtc: d("2026-10-17T10:30Z"),
    endUtc: d("2026-10-17T11:30Z"),
  };
  const studentClash: ConflictCandidate = {
    reason: "STUDENT",
    who: "Arjun",
    what: "Endgames 1-1",
    startUtc: d("2026-10-17T10:00Z"),
    endUtc: d("2026-10-17T10:45Z"),
  };
  const holiday: ConflictCandidate = {
    reason: "HOLIDAY",
    who: "",
    what: "Diwali",
    startUtc: d("2026-11-08T00:00Z"),
    endUtc: d("2026-11-09T00:00Z"),
  };

  it("reports each overlapping commitment in plain words", () => {
    const out = matchConflicts([{ startUtc: d("2026-10-17T10:00Z"), endUtc: d("2026-10-17T11:00Z") }], [coachClash, studentClash, holiday]);
    expect(out.map((c) => c.message)).toEqual([
      'Priya is already teaching "Saturday Juniors"',
      'Arjun is already in "Endgames 1-1"',
    ]);
  });

  it("checks every occurrence of a recurring proposal", () => {
    const out = matchConflicts(
      [
        { startUtc: d("2026-10-17T10:00Z"), endUtc: d("2026-10-17T11:00Z") },
        { startUtc: d("2026-11-08T10:00Z"), endUtc: d("2026-11-08T11:00Z") },
      ],
      [holiday]
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "HOLIDAY", occurrenceStartUtc: "2026-11-08T10:00:00.000Z" });
  });

  it("caps the report", () => {
    const proposed = Array.from({ length: 50 }, () => ({ startUtc: d("2026-10-17T10:00Z"), endUtc: d("2026-10-17T11:00Z") }));
    expect(matchConflicts(proposed, [coachClash])).toHaveLength(MAX_REPORTED_CONFLICTS);
  });

  it("summarises distinct clashes for the audit row", () => {
    const out = matchConflicts(
      [
        { startUtc: d("2026-10-17T10:00Z"), endUtc: d("2026-10-17T11:00Z") },
        { startUtc: d("2026-10-17T10:00Z"), endUtc: d("2026-10-17T11:00Z") },
      ],
      [coachClash]
    );
    expect(summarizeConflicts(out)).toBe('Priya is already teaching "Saturday Juniors"');
  });
});
