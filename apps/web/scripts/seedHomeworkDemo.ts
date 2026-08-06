// One-off dev script: creates a demo Tenant with one account per role
// (ACADEMY_ADMIN/COACH/STUDENT/PARENT), a Classroom enrolling the
// coach+student, a parent->student link, an upcoming LiveSession, two puzzles,
// and a homework Assignment — enough to click through every dashboard and the
// live session without hand-building fixtures via the signup UI. Safe to
// re-run: looks up existing rows/auth users by their fixed demo identifiers
// instead of erroring on duplicates.
//
// The coach and student sit in deliberately different time zones (IST vs EST)
// so anything that renders a time in the wrong zone is visible immediately.
//
// Run from apps/web: npx tsx --env-file=.env.local scripts/seedHomeworkDemo.ts

import { prisma, prismaBase } from "@chessplay-clone/db";
import type { Role } from "@chessplay-clone/shared";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import {
  createUserWithProfile,
  linkParentToStudent,
  unlinkParentFromStudent,
} from "../repositories/userRepository";
import { createClassroom, assignCoach, enrollStudent } from "../repositories/classroomRepository";
import { createAssignment } from "../repositories/assignmentRepository";
import { createLiveSession } from "../repositories/liveSessionRepository";
import { markAttendance } from "../repositories/attendanceRepository";

const SUBDOMAIN = "demo-academy";
const PASSWORD = "DemoPass123!";
const ADMIN_EMAIL = "admin@demo-academy.test";
const COACH_EMAIL = "coach@demo-academy.test";
const STUDENT_EMAIL = "student@demo-academy.test";
const PARENT_EMAIL = "parent@demo-academy.test";
// A second family in the same academy, enrolled in a classroom none of the
// accounts above belong to. Nothing renders it in the happy path — it exists
// so verifyDashboards can prove the classroom membership filter actually
// withholds something, which a single-classroom fixture can never show.
const OTHER_STUDENT_EMAIL = "other-student@demo-academy.test";
const OTHER_CLASSROOM = "Advanced Squad";

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
  role: Role;
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
  const parentAuth = await getOrCreateAuthUser(PARENT_EMAIL, PASSWORD);

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
  await getOrCreateUser({
    tenantId: tenant.id,
    email: PARENT_EMAIL,
    role: "PARENT",
    // A third zone, so the parent dashboard's times are visibly not just a
    // copy of the coach's or the student's.
    timezone: "Europe/London",
    authProviderId: parentAuth.id,
  });

  const coachProfile = await prisma.coachProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { authProviderId: coachAuth.id } },
  });
  const studentProfile = await prisma.studentProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { authProviderId: studentAuth.id } },
  });
  const parentProfile = await prisma.parentProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { authProviderId: parentAuth.id } },
  });

  // linkParentToStudent returns any existing link rather than creating a
  // second one, so this is safe on a re-run.
  await linkParentToStudent({
    tenantId: tenant.id,
    parentProfileId: parentProfile.id,
    studentProfileId: studentProfile.id,
  });

  let classroom = await prisma.classroom.findFirst({
    where: { tenantId: tenant.id, name: "Demo Classroom" },
  });
  if (!classroom) {
    classroom = await createClassroom(tenant.id, "Demo Classroom");
    await assignCoach(tenant.id, classroom.id, coachProfile.id);
    await enrollStudent(tenant.id, classroom.id, studentProfile.id);
  }

  // The negative fixture: a room in the same tenant with a different student
  // and no coach the demo accounts share. The demo coach, student and parent
  // must not see it or the email on its roster.
  const otherStudentAuth = await getOrCreateAuthUser(OTHER_STUDENT_EMAIL, PASSWORD);
  await getOrCreateUser({
    tenantId: tenant.id,
    email: OTHER_STUDENT_EMAIL,
    role: "STUDENT",
    timezone: "America/Los_Angeles",
    authProviderId: otherStudentAuth.id,
  });
  const otherStudentProfile = await prisma.studentProfile.findFirstOrThrow({
    where: { tenantId: tenant.id, user: { authProviderId: otherStudentAuth.id } },
  });
  let otherClassroom = await prisma.classroom.findFirst({
    where: { tenantId: tenant.id, name: OTHER_CLASSROOM },
  });
  if (!otherClassroom) {
    otherClassroom = await createClassroom(tenant.id, OTHER_CLASSROOM);
    await enrollStudent(tenant.id, otherClassroom.id, otherStudentProfile.id);
  }

  // A *revoked* link from the demo parent to the other family's child: linked,
  // then immediately unlinked, which soft-deletes the row rather than removing
  // it. This is the only fixture that can prove getChildForParent's
  // `deletedAt: null` filter is real — a child who was never linked 404s
  // because no row exists at all, which passes even if the filter is missing.
  const revoked = await prisma.parentStudent.findFirst({
    where: { tenantId: tenant.id, parentId: parentProfile.id, studentId: otherStudentProfile.id },
  });
  if (!revoked) {
    const link = await linkParentToStudent({
      tenantId: tenant.id,
      parentProfileId: parentProfile.id,
      studentProfileId: otherStudentProfile.id,
    });
    await unlinkParentFromStudent({ tenantId: tenant.id, linkId: link.id });
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

  // An upcoming session so the dashboard home has something in "upcoming
  // sessions" and there's a room to open. Kept in the future on every run —
  // listUpcomingSessions filters on scheduledAtUtc >= now, so a fixed date
  // would silently vanish from the dashboard once it passed.
  let liveSession = await prisma.liveSession.findFirst({
    where: { tenantId: tenant.id, classroomId: classroom.id, scheduledAtUtc: { gte: new Date() } },
    orderBy: { scheduledAtUtc: "asc" },
  });
  if (!liveSession) {
    liveSession = await createLiveSession({
      tenantId: tenant.id,
      classroomId: classroom.id,
      scheduledAtUtc: new Date(Date.now() + 24 * 60 * 60 * 1000),
      durationMins: 60,
    });
  }

  // A session that has already happened, with attendance marked, so the
  // report has real numbers rather than only an empty state. Dated before the
  // student's enrolment would make them correctly invisible in the denominator,
  // so keep it after.
  let pastSession = await prisma.liveSession.findFirst({
    where: { tenantId: tenant.id, classroomId: classroom.id, scheduledAtUtc: { lt: new Date() } },
    orderBy: { scheduledAtUtc: "desc" },
  });
  if (!pastSession) {
    pastSession = await createLiveSession({
      tenantId: tenant.id,
      classroomId: classroom.id,
      scheduledAtUtc: new Date(Date.now() - 24 * 60 * 60 * 1000),
      durationMins: 60,
    });
  }
  await markAttendance(tenant.id, pastSession.id, [
    { studentId: studentProfile.id, present: true, mode: "ONLINE" },
  ]);

  const base = `http://${SUBDOMAIN}.localhost:3000`;
  console.log("\nDemo data ready.\n");
  console.log(`Login page:     ${base}/login`);
  console.log(`Dashboard:      ${base}/dashboard`);
  console.log(`Homework:       ${base}/dashboard/homework`);
  console.log(
    `Live session:   ${base}/dashboard/classrooms/${classroom.id}/sessions/${liveSession.id}\n`
  );
  console.log(`All passwords:  ${PASSWORD}\n`);
  console.log(`Admin:    ${ADMIN_EMAIL}          (Asia/Kolkata)`);
  console.log(`Coach:    ${COACH_EMAIL}          (Asia/Kolkata)`);
  console.log(`Student:  ${studentUser.email}        (America/New_York)`);
  console.log(`Parent:   ${PARENT_EMAIL}         (Europe/London, linked to the student)`);
  console.log(
    `Other:    ${OTHER_STUDENT_EMAIL}   (America/Los_Angeles, in "${OTHER_CLASSROOM}" only)\n`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
