import { describe, expect, it } from "vitest";
import { renderCertificatePdf } from "./certificateTemplates";

// Smoke-level only: that the renderer produces a real PDF for each type, and
// that an academy without a logo still renders. Deliberately not asserting on
// layout or byte content — @react-pdf/renderer's own rendering correctness
// isn't this codebase's to test, and a byte snapshot would break on every
// wording tweak (claude.md §8: don't test framework code).

const base = {
  studentName: "Asha Menon",
  academyName: "Darklight Chess Academy",
  logoUrl: null,
  brandColor: "#1f4e3d",
  issuedOn: "14 September 2026",
};

function isPdf(buffer: Buffer) {
  return buffer.subarray(0, 4).toString("latin1") === "%PDF";
}

describe("renderCertificatePdf", () => {
  it("renders an attendance certificate", async () => {
    const buffer = await renderCertificatePdf({
      ...base,
      type: "ATTENDANCE",
      attendedCount: 18,
      sessionCount: 20,
      attendanceRate: "90%",
    });
    expect(isPdf(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("renders a rating milestone certificate", async () => {
    const buffer = await renderCertificatePdf({
      ...base,
      type: "RATING_MILESTONE",
      federation: "FIDE",
      rating: 1450,
      federationId: "25012345",
      recordedOn: "1 September 2026",
    });
    expect(isPdf(buffer)).toBe(true);
  });

  it("renders a tournament result certificate from coach-entered text", async () => {
    const buffer = await renderCertificatePdf({
      ...base,
      type: "TOURNAMENT_RESULT",
      eventName: "Delhi Open U14",
      eventResult: "2nd place",
      eventDate: "1 May 2026",
    });
    expect(isPdf(buffer)).toBe(true);
  });

  it("renders without a logo — plenty of academies never upload one", async () => {
    const buffer = await renderCertificatePdf({
      ...base,
      logoUrl: null,
      brandColor: null,
      type: "ATTENDANCE",
      attendedCount: 0,
      sessionCount: 0,
      attendanceRate: "—",
    });
    expect(isPdf(buffer)).toBe(true);
  });
});
