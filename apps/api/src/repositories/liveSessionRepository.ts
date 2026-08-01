import { prisma } from "@chessplay-clone/db";

// Prisma access for the socket layer lives here rather than in the handlers,
// per CLAUDE.md §7. Every function assumes the caller has already established
// ambient tenant context via runWithTenant, so tenantScope verifies the
// tenantId filters below rather than merely trusting them.

export type AppUser = {
  id: string;
  email: string;
  role: string;
};

// The Supabase JWT's `sub` is User.authProviderId, NOT User.id. CoachProfile
// and StudentProfile both key off User.id, so every membership check needs the
// real row first — matching a profile's userId against the auth id silently
// denies everyone.
//
// Scoping by tenantId as well as authProviderId means a token carrying a stale
// or forged tenant claim resolves to no user, and the connection is refused.
export async function findAppUserByAuthId(
  tenantId: string,
  authProviderId: string
): Promise<AppUser | null> {
  const user = await prisma.user.findFirst({
    where: { tenantId, authProviderId, deletedAt: null },
    select: { id: true, email: true, role: true },
  });
  return user;
}

export async function findLiveSessionClassroomId(
  tenantId: string,
  liveSessionId: string
): Promise<string | null> {
  const liveSession = await prisma.liveSession.findFirst({
    where: { id: liveSessionId, tenantId },
    select: { classroomId: true },
  });
  return liveSession?.classroomId ?? null;
}

export async function isClassroomCoach(
  tenantId: string,
  classroomId: string,
  userId: string
): Promise<boolean> {
  const membership = await prisma.classroomCoach.findFirst({
    where: { tenantId, classroomId, coach: { userId } },
    select: { id: true },
  });
  return membership !== null;
}

export async function isClassroomStudent(
  tenantId: string,
  classroomId: string,
  userId: string
): Promise<boolean> {
  const membership = await prisma.classroomStudent.findFirst({
    where: { tenantId, classroomId, student: { userId } },
    select: { id: true },
  });
  return membership !== null;
}

export async function findCoachProfileId(
  tenantId: string,
  userId: string
): Promise<string | null> {
  const profile = await prisma.coachProfile.findFirst({
    where: { tenantId, userId },
    select: { id: true },
  });
  return profile?.id ?? null;
}
