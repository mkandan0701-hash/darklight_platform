import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaBase } from "@chessplay-clone/db";
import { assignCoach, enrollStudent } from "./classroomRepository";
import { linkParentToStudent } from "./userRepository";

/**
 * Cross-tenant foreign ids, against real Postgres.
 *
 * The unit tests prove the repositories *ask* the right question, but they
 * mock Prisma, so they cannot show the thing that makes this bug class
 * dangerous: that neither the tenant-scoping extension nor a foreign-key
 * constraint stops the write on its own. Both are real here. The row being
 * inserted carries the caller's own tenantId — so tenantScope is satisfied —
 * and the FK only asks whether the referenced row exists, never whose it is.
 *
 * Needs DATABASE_URL pointing at a disposable database (the CI postgres
 * service). Never Supabase: this writes and deletes rows.
 */

const RUN = randomUUID().slice(0, 8);
const tenantA = `rw-a-${RUN}`;
const tenantB = `rw-b-${RUN}`;

let classroomA = "";
let studentB = "";
let studentA = "";
let coachB = "";
let parentA = "";

beforeAll(async () => {
  await prismaBase.tenant.createMany({
    data: [
      { id: tenantA, name: `A ${RUN}`, subdomain: `rw-a-${RUN}`, timezone: "UTC" },
      { id: tenantB, name: `B ${RUN}`, subdomain: `rw-b-${RUN}`, timezone: "UTC" },
    ],
  });

  const room = await prismaBase.classroom.create({
    data: { tenantId: tenantA, name: "A room" },
  });
  classroomA = room.id;

  const mkUser = (tenantId: string, role: string, tag: string) =>
    prismaBase.user.create({
      data: {
        tenantId,
        email: `${tag}-${RUN}@example.test`,
        role: role as never,
        timezone: "UTC",
        authProviderId: `auth-${tag}-${RUN}`,
      },
    });

  const [uStudentB, uStudentA, uCoachB, uParentA] = await Promise.all([
    mkUser(tenantB, "STUDENT", "student-b"),
    mkUser(tenantA, "STUDENT", "student-a"),
    mkUser(tenantB, "COACH", "coach-b"),
    mkUser(tenantA, "PARENT", "parent-a"),
  ]);

  const [pStudentB, pStudentA, pCoachB, pParentA] = await Promise.all([
    prismaBase.studentProfile.create({ data: { tenantId: tenantB, userId: uStudentB.id } }),
    prismaBase.studentProfile.create({ data: { tenantId: tenantA, userId: uStudentA.id } }),
    prismaBase.coachProfile.create({ data: { tenantId: tenantB, userId: uCoachB.id } }),
    prismaBase.parentProfile.create({ data: { tenantId: tenantA, userId: uParentA.id } }),
  ]);

  studentB = pStudentB.id;
  studentA = pStudentA.id;
  coachB = pCoachB.id;
  parentA = pParentA.id;
});

afterAll(async () => {
  const tenants = { in: [tenantA, tenantB] };
  await prismaBase.parentStudent.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.classroomStudent.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.classroomCoach.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.classroom.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.studentProfile.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.coachProfile.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.parentProfile.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.user.deleteMany({ where: { tenantId: tenants } });
  await prismaBase.tenant.deleteMany({ where: { id: tenants } });
  await prismaBase.$disconnect();
});

describe("enrollStudent", () => {
  it("refuses a student profile from another academy", async () => {
    await expect(enrollStudent(tenantA, classroomA, studentB)).rejects.toThrow(
      /does not belong to this academy/
    );

    const rows = await prismaBase.classroomStudent.findMany({
      where: { classroomId: classroomA },
    });
    expect(rows).toHaveLength(0);
  });

  it("enrols the academy's own student", async () => {
    await enrollStudent(tenantA, classroomA, studentA);
    const rows = await prismaBase.classroomStudent.findMany({
      where: { classroomId: classroomA },
    });
    expect(rows.map((r) => r.studentId)).toEqual([studentA]);
  });
});

describe("assignCoach", () => {
  it("refuses a coach profile from another academy", async () => {
    await expect(assignCoach(tenantA, classroomA, coachB)).rejects.toThrow(
      /does not belong to this academy/
    );

    const rows = await prismaBase.classroomCoach.findMany({
      where: { classroomId: classroomA },
    });
    expect(rows).toHaveLength(0);
  });
});

describe("linkParentToStudent", () => {
  it("refuses to link across academies", async () => {
    await expect(
      linkParentToStudent({
        tenantId: tenantA,
        parentProfileId: parentA,
        studentProfileId: studentB,
      })
    ).rejects.toThrow(/does not belong to this academy/);

    const rows = await prismaBase.parentStudent.findMany({ where: { parentId: parentA } });
    expect(rows).toHaveLength(0);
  });

  it("links a parent to a child in the same academy", async () => {
    const link = await linkParentToStudent({
      tenantId: tenantA,
      parentProfileId: parentA,
      studentProfileId: studentA,
    });
    expect(link).toMatchObject({ parentId: parentA, studentId: studentA });
  });
});
