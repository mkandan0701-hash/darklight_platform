// One-off dev script: creates a demo Tenant + ACADEMY_ADMIN/COACH/STUDENT
// accounts, a Classroom enrolling the coach+student, two puzzles, and a
// homework Assignment linking them — so the homework/attempt-logging feature
// can be clicked through in a browser without hand-building fixtures via the
// signup UI. Safe to re-run: looks up existing rows/auth users by their fixed
// demo identifiers instead of erroring on duplicates.
//
// Run from apps/web: npx tsx --env-file=.env.local scripts/seedHomeworkDemo.ts

import { prisma, prismaBase } from "@chessplay-clone/db";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { createUserWithProfile } from "../repositories/userRepository";
import { createClassroom, assignCoach, enrollStudent } from "../repositories/classroomRepository";
import { createAssignment } from "../repositories/assignmentRepository";

const SUBDOMAIN = "demo-academy";
const PASSWORD = "DemoPass123!";
const ADMIN_EMAIL = "admin@demo-academy.test";
const COACH_EMAIL = "coach@demo-academy.test";
const STUDENT_EMAIL = "student@demo-academy.test";

async function getOrCreateAuthUser(email: string, password: string) {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error && created.user) return created.user;

  // Already exists from a previous run of this script — look it up instead.
  const { data: list } = await supabaseAdmin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw new Error(`Could not create or find auth user for ${email}: ${error?.message}`);
  return existing;
}

async function getOrCreateUser(input: {
  tenantId: string;
  email: string;
  role: "ACADEMY_ADMIN" | "COACH" | "STUDENT";
  timezone: string;
  authProviderId: string;
}) {
  // Sanctioned unscoped lookup — same exception documented in
  // packages/db/src/index.ts and used by apps/web/lib/auth/session.ts: this
  // is the one lookup that discovers tenantId in the first place.
  const existing = await prismaBase.user.findUnique({
    where: { authProviderId: input.authProviderId },
  });
  if (existing) return existing;
  return createUserWithProfile(input);
}

async function main() {
  let tenant = await prisma.tenant.findUnique({ where: { subdomain: SUBDOMAIN } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: "Demo Chess Academy", subdomain: SUBDOMAIN, timezone: "Asia/Kolkata" },
    });
  }

  const adminAuth = await getOrCreateAuthUser(ADMIN_EMAIL, PASSWORD);
  const coachAuth = await getOrCreateAuthUser(COACH_EMAIL, PASSWORD);
  const studentAuth = await getOrCreateAuthUser(STUDENT_EMAIL, PASSWORD);

  await getOrCreateUser({
    tenantId: tenant.id,
    email: ADMIN_EMAIL,
    role: "ACADEMY_ADMIN",
    timezone: "Asia/Kolkata",
    authProviderId: adminAuth.id,
  });
  await getOrCreateUser({
    tenantId: tenant.id,
    email: COACH_EMAIL,
    role: "COACH",
    timezone: "Asia/Kolkata",
    authProviderId: coachAuth.id,
  });
  const studentUser = await getOrCreateUser({
    tenantId: tenant.id,
    email: STUDENT_EMAIL,
    role: "STUDENT",
    timezone: "America/New_York",
    authProviderId: studentAuth.id,
  });

  const coachProfile = await prisma.coachProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { authProviderId: coachAuth.id } },
  });
  const studentProfile = await prisma.studentProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { authProviderId: studentAuth.id } },
  });

  let classroom = await prisma.classroom.findFirst({
    where: { tenantId: tenant.id, name: "Demo Classroom" },
  });
  if (!classroom) {
    classroom = await createClassroom(tenant.id, "Demo Classroom");
    await assignCoach(tenant.id, classroom.id, coachProfile.id);
    await enrollStudent(tenant.id, classroom.id, studentProfile.id);
  }

  // Two known-legal puzzles: a real mate-in-a-few (already exercised by
  // lichessPuzzleImport.test.ts's normalization case) and a trivial one-move
  // "puzzle" from the starting position, so the attempt board can be tried
  // both with and without an auto-played opponent reply in between.
  let puzzles = await prisma.puzzle.findMany({
    where: { tenantId: tenant.id, source: "UPLOAD" },
  });
  if (puzzles.length === 0) {
    puzzles = await Promise.all([
      prisma.puzzle.create({
        data: {
          tenantId: tenant.id,
          source: "UPLOAD",
          uploadedByUserId: coachProfile.userId,
          fen: "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2b1/PqP3PP/7K w - - 0 25",
          moves: "e6e7 b2b1 b3c1 b1c1 h6c1",
          themes: ["mate", "mateIn2"],
        },
      }),
      prisma.puzzle.create({
        data: {
          tenantId: tenant.id,
          source: "UPLOAD",
          uploadedByUserId: coachProfile.userId,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          moves: "e2e4",
          themes: ["opening"],
        },
      }),
    ]);
  }

  let assignment = await prisma.assignment.findFirst({
    where: { tenantId: tenant.id, classroomId: classroom.id, title: "Week 1 Tactics" },
  });
  if (!assignment) {
    assignment = await createAssignment(tenant.id, {
      classroomId: classroom.id,
      title: "Week 1 Tactics",
      dueAtUtc: null,
      puzzleIds: puzzles.map((p) => p.id),
    });
  }

  console.log("\nDemo data ready.\n");
  console.log(`Dashboard URL:  http://${SUBDOMAIN}.localhost:3000/dashboard`);
  console.log(`Homework URL:   http://${SUBDOMAIN}.localhost:3000/dashboard/homework`);
  console.log(`Login page:     http://${SUBDOMAIN}.localhost:3000/login\n`);
  console.log(`Admin login:    ${ADMIN_EMAIL} / ${PASSWORD}`);
  console.log(`Coach login:    ${COACH_EMAIL} / ${PASSWORD}`);
  console.log(`Student login:  ${STUDENT_EMAIL} / ${PASSWORD} (${studentUser.email})\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
