import { randomUUID } from "node:crypto";
import { prisma } from "@chessplay-clone/db";
import { TenantMismatchError } from "../lib/auth/errors";

/**
 * Creates the exhibition and its boards together.
 *
 * One transaction because a Simul with no boards is not a half-made thing a
 * coach can finish later — it is an exhibition nobody can sit down at, and
 * the UI offers no way to add boards afterwards.
 */
export async function createSimulWithBoards(input: {
  tenantId: string;
  coachId: string;
  startsAtUtc: Date;
  studentIds: string[];
}) {
  // Every id comes off a form, and the rows being written carry the caller's
  // own tenantId — so tenantScope passes regardless of whose coach or students
  // these are. Only this check keeps another academy off the boards.
  const [coach, students] = await Promise.all([
    prisma.coachProfile.findFirst({
      where: { id: input.coachId, tenantId: input.tenantId },
      select: { id: true },
    }),
    prisma.studentProfile.findMany({
      where: { id: { in: input.studentIds }, tenantId: input.tenantId },
      select: { id: true },
    }),
  ]);
  if (!coach || students.length !== input.studentIds.length) {
    throw new TenantMismatchError("Coach or student does not belong to this academy");
  }

  return prisma.$transaction(async (tx) => {
    const simul = await tx.simul.create({
      data: {
        tenantId: input.tenantId,
        coachId: input.coachId,
        startsAtUtc: input.startsAtUtc,
      },
    });

    await tx.simulBoard.createMany({
      data: input.studentIds.map((studentId, index) => ({
        tenantId: input.tenantId,
        simulId: simul.id,
        boardIdx: index + 1,
        studentId,
        socketRoomId: randomUUID(),
      })),
    });

    return simul;
  });
}

export async function listSimuls(tenantId: string) {
  return prisma.simul.findMany({
    where: { tenantId },
    include: { boards: { orderBy: { boardIdx: "asc" } } },
    orderBy: { startsAtUtc: "desc" },
  });
}

export async function getSimul(tenantId: string, simulId: string) {
  return prisma.simul.findFirst({
    where: { id: simulId, tenantId },
    include: { boards: { orderBy: { boardIdx: "asc" } } },
  });
}

export async function getSimulBoard(tenantId: string, simulBoardId: string) {
  return prisma.simulBoard.findFirst({
    where: { id: simulBoardId, tenantId },
    include: { simul: true },
  });
}
