import { prisma } from "@chessplay-clone/db";

// Called inside runWithTenant, so tenantScope verifies these filters rather
// than merely finding a tenantId present.

export interface SimulBoardContext {
  boardId: string;
  simulId: string;
  boardIdx: number;
  studentId: string;
  /** CoachProfile id of the coach giving the exhibition. */
  coachId: string;
}

export async function findSimulBoard(
  tenantId: string,
  simulBoardId: string
): Promise<SimulBoardContext | null> {
  const board = await prisma.simulBoard.findFirst({
    where: { id: simulBoardId, tenantId },
    select: {
      id: true,
      simulId: true,
      boardIdx: true,
      studentId: true,
      simul: { select: { coachId: true } },
    },
  });
  if (!board) return null;

  return {
    boardId: board.id,
    simulId: board.simulId,
    boardIdx: board.boardIdx,
    studentId: board.studentId,
    coachId: board.simul.coachId,
  };
}

/** The StudentProfile id for a user, for matching against a board's student. */
export async function findStudentProfileId(
  tenantId: string,
  userId: string
): Promise<string | null> {
  const profile = await prisma.studentProfile.findFirst({
    where: { tenantId, userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}
