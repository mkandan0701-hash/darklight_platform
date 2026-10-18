// Persistence and fan-out for external game sync, shared by both providers.

import { prisma, prismaBase, runWithTenant, type GameSource } from "@chessplay-clone/db";
import type { SyncedGame } from "./types";

export interface StudentSyncTarget {
  tenantId: string;
  studentId: string;
  handle: string;
}

/**
 * Writes any games not already on file for this student.
 *
 * Idempotent by construction (CLAUDE.md §3.8): `@@unique([source, externalId])`
 * plus `skipDuplicates` means a re-run — a retried job, an overlapping manual
 * trigger, or two nightly sweeps racing — inserts nothing the second time,
 * rather than duplicating a student's whole history.
 *
 * Call inside runWithTenant so tenantScope verifies the tenantId rather than
 * merely finding one present.
 */
export async function persistSyncedGames(
  tenantId: string,
  studentId: string,
  source: GameSource,
  games: SyncedGame[]
): Promise<{ imported: number }> {
  if (games.length === 0) return { imported: 0 };

  const result = await prisma.game.createMany({
    data: games.map((game) => ({
      tenantId,
      studentId,
      source,
      externalId: game.externalId,
      pgn: game.pgn,
      playedAtUtc: game.playedAtUtc,
      result: game.result,
    })),
    skipDuplicates: true,
  });

  return { imported: result.count };
}

/** The newest game already stored, so a re-sync only asks for what's new. */
export async function latestPlayedAt(
  tenantId: string,
  studentId: string,
  source: GameSource
): Promise<Date | undefined> {
  const newest = await prisma.game.findFirst({
    where: { tenantId, studentId, source },
    orderBy: { playedAtUtc: "desc" },
    select: { playedAtUtc: true },
  });
  return newest?.playedAtUtc;
}

/**
 * Every student across every tenant who has a handle for this provider.
 *
 * Tenant is the sanctioned untenanted read (packages/db/src/index.ts); each
 * tenant's students are then listed inside that tenant's own ambient context,
 * so the scoped query is verified rather than trusted.
 */
export async function listSyncTargets(source: GameSource): Promise<StudentSyncTarget[]> {
  const tenants = await prismaBase.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  const targets: StudentSyncTarget[] = [];
  for (const tenant of tenants) {
    await runWithTenant(tenant.id, async () => {
      const students = await prisma.studentProfile.findMany({
        where:
          source === "LICHESS"
            ? { tenantId: tenant.id, lichessHandle: { not: null } }
            : { tenantId: tenant.id, chesscomHandle: { not: null } },
        select: { id: true, lichessHandle: true, chesscomHandle: true },
      });
      for (const student of students) {
        const handle = source === "LICHESS" ? student.lichessHandle : student.chesscomHandle;
        // The `not: null` filter already excludes nulls; this also drops a
        // handle someone saved as whitespace.
        if (!handle?.trim()) continue;
        targets.push({ tenantId: tenant.id, studentId: student.id, handle: handle.trim() });
      }
    });
  }

  return targets;
}
