// Creates a throwaway QA academy for the Playwright suite (e2e/).
//
// Everything lives under a fresh tenant `qa-<run>`, so it can never collide
// with a real academy or with demo-academy, and teardownQaTenant.mts can remove
// it by tenant id alone. Users are created the same way signUpAcademy and
// inviteMember do: a confirmed Supabase Auth user plus createUserWithProfile.
//
// Credentials go to the file named by QA_FIXTURE_FILE (default: ./qa-fixture.json
// in the current directory) — never into the repo. Run from apps/web:
//   QA_FIXTURE_FILE=<scratch>/qa.json npx tsx --env-file=.env.local scripts/qa/seedQaTenant.mts

import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { prismaBase } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { createUserWithProfile } from "../../repositories/userRepository";
import { createClassroom, assignCoach, enrollStudent } from "../../repositories/classroomRepository";

const run = randomUUID().slice(0, 8);
const subdomain = `qa-${run}`;
const password = `Qa-${randomBytes(9).toString("base64url")}`;
const supabase = createSupabaseAdminClient();

type Person = { key: string; role: Role; timezone: string; name: string };
const PEOPLE: Person[] = [
  { key: "admin", role: "ACADEMY_ADMIN", timezone: "Asia/Kolkata", name: "QA Admin" },
  { key: "coachA", role: "COACH", timezone: "Asia/Kolkata", name: "QA Coach Anand" },
  { key: "coachZ", role: "COACH", timezone: "Asia/Kolkata", name: "QA Coach Zara" },
  { key: "studentB", role: "STUDENT", timezone: "America/New_York", name: "QA Student Bala" },
  { key: "studentC", role: "STUDENT", timezone: "Asia/Kolkata", name: "QA Student Chitra" },
  { key: "parentP", role: "PARENT", timezone: "America/New_York", name: "QA Parent Priya" },
  { key: "parentQ", role: "PARENT", timezone: "Asia/Kolkata", name: "QA Parent Quentin" },
];

const tenant = await prismaBase.tenant.create({
  data: { name: `QA Academy ${run}`, subdomain, timezone: "Asia/Kolkata" },
});

const users: Record<string, { email: string; userId: string; profileId: string | null; role: Role }> = {};
for (const p of PEOPLE) {
  const email = `${subdomain}-${p.key.toLowerCase()}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${p.key}: ${error?.message}`);
  const user = await createUserWithProfile({
    tenantId: tenant.id,
    email,
    role: p.role,
    timezone: p.timezone,
    authProviderId: data.user.id,
    displayName: p.name,
  });
  const profile =
    p.role === "COACH"
      ? await prismaBase.coachProfile.findUnique({ where: { userId: user.id } })
      : p.role === "STUDENT"
        ? await prismaBase.studentProfile.findUnique({ where: { userId: user.id } })
        : p.role === "PARENT"
          ? await prismaBase.parentProfile.findUnique({ where: { userId: user.id } })
          : null;
  users[p.key] = { email, userId: user.id, profileId: profile?.id ?? null, role: p.role };
}

// Coach A teaches student B; coach Z and student C are outsiders to it.
const room = await createClassroom(tenant.id, "QA Saturday Juniors");
await assignCoach(tenant.id, room.id, users.coachA.profileId!);
await enrollStudent(tenant.id, room.id, users.studentB.profileId!);
const otherRoom = await createClassroom(tenant.id, "QA Zara's Endgames");
await assignCoach(tenant.id, otherRoom.id, users.coachZ.profileId!);
await enrollStudent(tenant.id, otherRoom.id, users.studentC.profileId!);

await prismaBase.parentStudent.create({
  data: { tenantId: tenant.id, parentId: users.parentP.profileId!, studentId: users.studentB.profileId! },
});
await prismaBase.parentStudent.create({
  data: { tenantId: tenant.id, parentId: users.parentQ.profileId!, studentId: users.studentC.profileId! },
});

const file = process.env.QA_FIXTURE_FILE ?? "qa-fixture.json";
writeFileSync(
  file,
  JSON.stringify(
    { run, subdomain, tenantId: tenant.id, password, users, rooms: { main: room.id, other: otherRoom.id } },
    null,
    2
  )
);
console.log(`Seeded ${subdomain} (${PEOPLE.length} users, 2 classrooms). Fixture: ${file}`);
await prismaBase.$disconnect();
