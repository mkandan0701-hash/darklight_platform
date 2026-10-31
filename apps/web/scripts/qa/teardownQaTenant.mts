// Removes a QA academy created by seedQaTenant.mts: every row carrying its
// tenantId, then its Supabase Auth users. Refuses any subdomain that doesn't
// start with "qa-", so it cannot be pointed at a real academy.
//
// Hard deletes are deliberate here and only here: these are fixtures this
// suite created, not academy records (claude.md §4's soft-delete rule is about
// user-facing data and audit trails).
//
//   QA_FIXTURE_FILE=<scratch>/qa.json npx tsx --env-file=.env.local scripts/qa/teardownQaTenant.mts

import { readFileSync } from "node:fs";
import { prismaBase as db } from "@chessplay-clone/db";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";

const fixture = JSON.parse(readFileSync(process.env.QA_FIXTURE_FILE ?? "qa-fixture.json", "utf8")) as {
  subdomain: string;
  tenantId: string;
};
if (!fixture.subdomain.startsWith("qa-")) throw new Error(`Refusing to tear down ${fixture.subdomain}`);
const tenant = await db.tenant.findUnique({ where: { id: fixture.tenantId } });
if (!tenant || tenant.subdomain !== fixture.subdomain) throw new Error("Fixture tenant mismatch; refusing");

const where = { tenantId: tenant.id };
const authIds = (await db.user.findMany({ where, select: { authProviderId: true } })).map((u) => u.authProviderId);

// Children before parents.
await db.liveSessionChange.deleteMany({ where });
await db.attendanceRecord.deleteMany({ where });
await db.referenceBoard.deleteMany({ where });
await db.puzzleAttempt.deleteMany({ where });
await db.assignmentPuzzle.deleteMany({ where });
await db.xpEvent.deleteMany({ where });
await db.studentBadge.deleteMany({ where });
await db.liveSession.deleteMany({ where });
await db.classroomScheduleSlot.deleteMany({ where });
await db.assignment.deleteMany({ where });
await db.calendarBlock.deleteMany({ where });
await db.classroomStudent.deleteMany({ where });
await db.classroomCoach.deleteMany({ where });
await db.classroom.deleteMany({ where });
await db.tournamentPairing.deleteMany({ where });
await db.tournamentParticipant.deleteMany({ where });
await db.tournament.deleteMany({ where });
await db.simulBoard.deleteMany({ where });
await db.simul.deleteMany({ where });
await db.ratingRecord.deleteMany({ where });
await db.certificate.deleteMany({ where });
await db.invoice.deleteMany({ where });
await db.gameAnalysis.deleteMany({ where });
await db.game.deleteMany({ where });
await db.pgnFile.deleteMany({ where });
await db.pgnFolder.deleteMany({ where });
await db.puzzle.deleteMany({ where });
await db.parentStudent.deleteMany({ where });
await db.coachProfile.deleteMany({ where });
await db.studentProfile.deleteMany({ where });
await db.parentProfile.deleteMany({ where });
await db.user.deleteMany({ where });
await db.tenant.delete({ where: { id: tenant.id } });

const supabase = createSupabaseAdminClient();
for (const id of authIds) {
  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) console.error(`auth user ${id}: ${error.message}`);
}

const left = await db.user.count({ where });
console.log(`Tore down ${fixture.subdomain}: ${authIds.length} auth users removed, ${left} user rows left.`);
await db.$disconnect();
