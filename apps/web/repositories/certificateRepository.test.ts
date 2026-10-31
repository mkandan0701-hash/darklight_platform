import { describe, expect, it, vi, beforeEach } from "vitest";

const studentFindFirst = vi.fn();
const certificateCreate = vi.fn();
const certificateFindMany = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  prisma: {
    studentProfile: { findFirst: (...a: unknown[]) => studentFindFirst(...a) },
    certificate: {
      create: (...a: unknown[]) => certificateCreate(...a),
      findMany: (...a: unknown[]) => certificateFindMany(...a),
    },
  },
}));

const { createCertificate, listCertificatesForStudent, listCertificatesForTenant } = await import(
  "./certificateRepository"
);

const baseInput = {
  tenantId: "tenant_1",
  studentId: "stu_1",
  type: "ATTENDANCE" as const,
  pdfUrl: "https://cdn.example.test/certificates/tenant_1/stu_1/cert_1.pdf",
  issuedByUserId: "user_1",
};

beforeEach(() => {
  [studentFindFirst, certificateCreate, certificateFindMany].forEach((m) => m.mockReset());
  studentFindFirst.mockResolvedValue(null);
  certificateFindMany.mockResolvedValue([]);
});

describe("createCertificate", () => {
  it("refuses a student from another academy", async () => {
    await expect(createCertificate(baseInput)).rejects.toThrow(/does not belong to this academy/);
    expect(certificateCreate).not.toHaveBeenCalled();
  });

  it("scopes the student lookup to the caller's tenant, then writes", async () => {
    studentFindFirst.mockResolvedValue({ id: "stu_1" });
    await createCertificate(baseInput);
    expect(studentFindFirst.mock.calls[0][0].where).toEqual({
      id: "stu_1",
      tenantId: "tenant_1",
    });
    expect(certificateCreate).toHaveBeenCalledWith({ data: baseInput });
  });

  it("carries the free-text tournament fields through when present", async () => {
    studentFindFirst.mockResolvedValue({ id: "stu_1" });
    const eventDateUtc = new Date("2026-05-01T00:00:00.000Z");
    await createCertificate({
      ...baseInput,
      type: "TOURNAMENT_RESULT",
      eventName: "Delhi Open U14",
      eventResult: "2nd place",
      eventDateUtc,
    });
    expect(certificateCreate.mock.calls[0][0].data).toMatchObject({
      eventName: "Delhi Open U14",
      eventResult: "2nd place",
      eventDateUtc,
    });
  });
});

describe("listCertificatesForStudent", () => {
  it("scopes by tenant and student, newest first", async () => {
    await listCertificatesForStudent("tenant_1", "stu_1");
    expect(certificateFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant_1", studentId: "stu_1" },
      orderBy: { issuedAtUtc: "desc" },
    });
  });
});

describe("listCertificatesForTenant", () => {
  it("scopes by tenant only", async () => {
    await listCertificatesForTenant("tenant_1");
    expect(certificateFindMany.mock.calls[0][0].where).toEqual({ tenantId: "tenant_1" });
  });
});
