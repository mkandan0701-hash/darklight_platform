import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenantMismatchError } from "../../../../lib/auth/errors";

const getCurrentSession = vi.fn();
const recordRating = vi.fn();
const getLatestRatingByFederation = vi.fn();
const createCertificate = vi.fn();
const getStudentAttendanceSummary = vi.fn();
const getStudentProfile = vi.fn();
const getTenantById = vi.fn();
const renderCertificatePdf = vi.fn();
const uploadCertificatePdf = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../repositories/ratingRepository", () => ({
  recordRating: (...a: unknown[]) => recordRating(...a),
  getLatestRatingByFederation: (...a: unknown[]) => getLatestRatingByFederation(...a),
}));
vi.mock("../../../../repositories/certificateRepository", () => ({
  createCertificate: (...a: unknown[]) => createCertificate(...a),
}));
vi.mock("../../../../repositories/attendanceRepository", () => ({
  getStudentAttendanceSummary: (...a: unknown[]) => getStudentAttendanceSummary(...a),
}));
vi.mock("../../../../repositories/userRepository", () => ({
  getStudentProfile: (...a: unknown[]) => getStudentProfile(...a),
}));
vi.mock("../../../../repositories/tenantRepository", () => ({
  getTenantById: (...a: unknown[]) => getTenantById(...a),
}));
vi.mock("../../../../lib/pdf/certificateTemplates", () => ({
  renderCertificatePdf: (...a: unknown[]) => renderCertificatePdf(...a),
}));
vi.mock("../../../../lib/storage/r2Client", () => ({
  uploadCertificatePdf: (...a: unknown[]) => uploadCertificatePdf(...a),
}));

const { recordRatingAction, generateCertificateAction } = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "c@x.test",
  timezone: "Asia/Kolkata",
});

function ratingForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("studentId", "stu_1");
  fd.set("federation", "FIDE");
  fd.set("rating", "1450");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

function certificateForm(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("type", "ATTENDANCE");
  fd.set("studentId", "stu_1");
  for (const [k, v] of Object.entries(overrides)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [
    getCurrentSession,
    recordRating,
    getLatestRatingByFederation,
    createCertificate,
    getStudentAttendanceSummary,
    getStudentProfile,
    getTenantById,
    renderCertificatePdf,
    uploadCertificatePdf,
  ].forEach((m) => m.mockReset());

  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  recordRating.mockResolvedValue({ id: "rr_1" });
  getLatestRatingByFederation.mockResolvedValue(
    new Map([["FIDE", { rating: 1450, recordedAtUtc: new Date("2026-09-01T00:00:00.000Z") }]])
  );
  createCertificate.mockResolvedValue({ id: "cert_1" });
  getStudentAttendanceSummary.mockResolvedValue({ attendedCount: 18, sessionCount: 20 });
  getStudentProfile.mockResolvedValue({
    id: "stu_1",
    fideId: "25012345",
    uscfId: null,
    eclId: null,
    user: { email: "asha@x.test", displayName: "Asha Menon" },
  });
  getTenantById.mockResolvedValue({
    id: "tenant_1",
    name: "Darklight Chess Academy",
    logoUrl: null,
    brandColor: "#1f4e3d",
  });
  renderCertificatePdf.mockResolvedValue(Buffer.from("%PDF-fake"));
  uploadCertificatePdf.mockResolvedValue("https://cdn.example.test/certificates/x.pdf");
});

describe("recordRatingAction", () => {
  it("refuses a student or parent outright", async () => {
    for (const role of ["STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      expect(await recordRatingAction(ratingForm())).toMatchObject({ ok: false });
      expect(recordRating).not.toHaveBeenCalled();
    }
  });

  it("lets a coach record a rating, stamping who entered it", async () => {
    expect(await recordRatingAction(ratingForm())).toEqual({ ok: true });
    expect(recordRating).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      studentId: "stu_1",
      federation: "FIDE",
      rating: 1450,
      recordedByUserId: "user_1",
    });
  });

  it("rejects an implausible rating rather than storing a typo", async () => {
    expect(await recordRatingAction(ratingForm({ rating: "14500" }))).toMatchObject({ ok: false });
    expect(recordRating).not.toHaveBeenCalled();
  });

  it("translates a cross-tenant student into a user-facing error", async () => {
    recordRating.mockRejectedValue(new TenantMismatchError("nope"));
    expect(await recordRatingAction(ratingForm())).toEqual({
      ok: false,
      error: "That student isn't part of your academy",
    });
  });
});

describe("generateCertificateAction", () => {
  it("refuses a student or parent outright", async () => {
    for (const role of ["STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      expect(await generateCertificateAction(certificateForm())).toMatchObject({ ok: false });
      expect(renderCertificatePdf).not.toHaveBeenCalled();
    }
  });

  it("renders and uploads before writing the row, in that order", async () => {
    expect(await generateCertificateAction(certificateForm())).toEqual({ ok: true });

    expect(renderCertificatePdf.mock.invocationCallOrder[0]).toBeLessThan(
      uploadCertificatePdf.mock.invocationCallOrder[0]
    );
    expect(uploadCertificatePdf.mock.invocationCallOrder[0]).toBeLessThan(
      createCertificate.mock.invocationCallOrder[0]
    );
    expect(createCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_1",
        studentId: "stu_1",
        type: "ATTENDANCE",
        pdfUrl: "https://cdn.example.test/certificates/x.pdf",
        issuedByUserId: "user_1",
      })
    );
  });

  // The bug this guards: a Certificate row whose pdfUrl points at an object
  // that was never stored is a dead link on a document a family goes looking
  // for years later.
  it("never writes the row when the upload fails", async () => {
    uploadCertificatePdf.mockRejectedValue(new Error("r2 is down"));
    expect(await generateCertificateAction(certificateForm())).toEqual({
      ok: false,
      error: "Could not store the certificate — please try again",
    });
    expect(createCertificate).not.toHaveBeenCalled();
  });

  it("never uploads or writes when the PDF render fails", async () => {
    renderCertificatePdf.mockRejectedValue(new Error("render blew up"));
    expect(await generateCertificateAction(certificateForm())).toMatchObject({ ok: false });
    expect(uploadCertificatePdf).not.toHaveBeenCalled();
    expect(createCertificate).not.toHaveBeenCalled();
  });

  it("refuses a RATING_MILESTONE for a federation with no rating on file", async () => {
    getLatestRatingByFederation.mockResolvedValue(new Map());
    const result = await generateCertificateAction(
      certificateForm({ type: "RATING_MILESTONE", federation: "USCF" })
    );
    expect(result).toEqual({
      ok: false,
      error: "No USCF rating on file for this student yet",
    });
    expect(createCertificate).not.toHaveBeenCalled();
  });

  it("passes the federation ID onto a rating certificate when the student has one", async () => {
    await generateCertificateAction(certificateForm({ type: "RATING_MILESTONE", federation: "FIDE" }));
    expect(renderCertificatePdf).toHaveBeenCalledWith(
      expect.objectContaining({ federation: "FIDE", rating: 1450, federationId: "25012345" })
    );
  });

  it("persists the coach-typed fields on a tournament certificate", async () => {
    await generateCertificateAction(
      certificateForm({
        type: "TOURNAMENT_RESULT",
        eventName: "Delhi Open U14",
        eventResult: "2nd place",
        eventLocalDate: "2026-05-01",
      })
    );
    expect(createCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "TOURNAMENT_RESULT",
        eventName: "Delhi Open U14",
        eventResult: "2nd place",
        eventDateUtc: expect.any(Date),
      })
    );
  });

  it("refuses a student from another academy before rendering anything", async () => {
    getStudentProfile.mockResolvedValue(null);
    expect(await generateCertificateAction(certificateForm())).toEqual({
      ok: false,
      error: "That student isn't part of your academy",
    });
    expect(renderCertificatePdf).not.toHaveBeenCalled();
  });
});
