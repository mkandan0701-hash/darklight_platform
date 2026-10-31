import { prisma } from "@chessplay-clone/db";

// Prisma access for the socket layer lives here rather than in the handlers,
// per CLAUDE.md §7. Assumes the caller has already established ambient tenant
// context via runWithTenant.

/**
 * Whether this tournament belongs to the viewer's academy.
 *
 * That is the entire access rule for the tournament room (CLAUDE.md §5:
 * "Participants + spectators"), so no participant or profile lookup is needed —
 * a classmate, a parent and an admin may all watch. What it does stop is a user
 * from another tenant joining by guessing an id, which is why the filter
 * carries tenantId rather than just the primary key.
 */
export async function tournamentExistsForTenant(
  tenantId: string,
  tournamentId: string
): Promise<boolean> {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, tenantId },
    select: { id: true },
  });
  return tournament !== null;
}
