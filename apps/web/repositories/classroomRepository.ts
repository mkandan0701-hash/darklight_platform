import { prisma } from "@chessplay-clone/db";

export async function createClassroom(
  tenantId: string,
  name: string,
  weekendFirst = true
) {
  return prisma.classroom.create({ data: { tenantId, name, weekendFirst } });
}

export async function listClassrooms(tenantId: string) {
  return prisma.classroom.findMany({
    where: { tenantId, deletedAt: null },
    include: {
      coaches: { include: { coach: { include: { user: true } } } },
      students: { include: { student: { include: { user: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getClassroom(tenantId: string, classroomId: string) {
  return prisma.classroom.findFirst({
    where: { id: classroomId, tenantId, deletedAt: null },
    include: {
      coaches: { include: { coach: { include: { user: true } } } },
      students: { include: { student: { include: { user: true } } } },
    },
  });
}

export async function assignCoach(
  tenantId: string,
  classroomId: string,
  coachProfileId: string
) {
  return prisma.classroomCoach.create({
    data: { tenantId, classroomId, coachId: coachProfileId },
  });
}

export async function enrollStudent(
  tenantId: string,
  classroomId: string,
  studentProfileId: string
) {
  return prisma.classroomStudent.create({
    data: { tenantId, classroomId, studentId: studentProfileId },
  });
}
