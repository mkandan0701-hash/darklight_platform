import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { openTenantContext, prismaBase, requireTenantContext } from "@chessplay-clone/db";
import type { CurrentSession } from "../lib/auth/session";

/**
 * Cross-tenant regression net, at the server-action boundary, on real Postgres.
 *
 * Academy A's admin calls each action family with Academy B's ids. Every call
 * must be refused — an { ok: false } result or a thrown error both count — and,
 * the part that matters, B's rows must be exactly as they were. Positive
 * controls with A's own ids prove the refusals aren't just a broken harness.
 *
 * Runs with tenantScope's strict mode on and a session mock that binds the
 * ambient tenant the way the real getCurrentSession does, so it also shows the
 * actions work under TENANT_SCOPE_STRICT=1.
 *
 * Needs DATABASE_URL pointing at a disposable database (the CI postgres
 * service). Never Supabase: this writes and deletes rows.
 */

const RUN = randomUUID().slice(0, 8);
const A = `xt-a-${RUN}`;
const B = `xt-b-${RUN}`;

let session: CurrentSession;
vi.mock("../lib/auth/session", () => ({
  getCurrentSession: () => {
    const bind = openTenantContext();
    return Promise.resolve(session).then((s) => {
      bind(s.tenantId);
      return s;
    });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
// Must never be reached with a foreign id; a call here fails the test loudly.
vi.mock("../lib/queues/analysisQueue", () => ({
  enqueueGameAnalysis: vi.fn(async () => {
    throw new Error("enqueued analysis for a game the caller should never reach");
  }),
}));
const providerReached = () => {
  throw new Error("payment provider reached");
};
vi.mock("../lib/payments/stripeClient", () => ({ createStripeClient: providerReached }));
vi.mock("../lib/payments/razorpayClient", () => ({ createRazorpayClient: providerReached }));

const classrooms = await import("../app/(dashboard)/dashboard/classrooms/actions");
const attendance = await import("../app/(dashboard)/dashboard/attendance/actions");
const billing = await import("../app/(dashboard)/dashboard/billing/actions");
const calendar = await import("../app/(dashboard)/dashboard/calendar/actions");
const members = await import("../app/(dashboard)/dashboard/members/actions");
const pgn = await import("../app/(dashboard)/dashboard/pgn-library/actions");
const students = await import("../app/(dashboard)/dashboard/students/actions");
const tournaments = await import("../app/(dashboard)/dashboard/tournaments/actions");
const homework = await import("../app/(dashboard)/dashboard/homework/actions");
const games = await import("../app/(dashboard)/dashboard/games/actions");
const pgnDownload = await import("../app/(dashboard)/dashboard/pgn-library/download/[fileId]/route");

const ids = {} as Record<
  | "adminA" | "classroomA" | "studentA" | "sessionA"
  | "classroomB" | "studentB" | "parentB" | "coachB" | "sessionB" | "slotB" | "blockB"
  | "folderB" | "fileB" | "tournamentB" | "gameB" | "linkB",
  string
>;

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Refused means an { ok: false } result, or a throw. Anything else is a leak. */
async function expectRefused(call: () => Promise<unknown>) {
  let result: unknown;
  try {
    result = await call();
  } catch {
    return;
  }
  expect(result).toMatchObject({ ok: false });
}

async function snapshotB() {
  const where = { tenantId: B };
  return {
    classroomStudents: await prismaBase.classroomStudent.count({ where }),
    sessions: await prismaBase.liveSession.findMany({ where, orderBy: { id: "asc" } }),
    slots: await prismaBase.classroomScheduleSlot.findMany({ where, orderBy: { id: "asc" } }),
    blocks: await prismaBase.calendarBlock.findMany({ where, orderBy: { id: "asc" } }),
    classroomsB: await prismaBase.classroom.findMany({ where, orderBy: { id: "asc" } }),
    attendance: await prismaBase.attendanceRecord.count({ where }),
    invoices: await prismaBase.invoice.count({ where }),
    links: await prismaBase.parentStudent.findMany({ where, orderBy: { id: "asc" } }),
    folders: await prismaBase.pgnFolder.findMany({ where, orderBy: { id: "asc" } }),
    files: await prismaBase.pgnFile.findMany({ where, orderBy: { id: "asc" } }),
    ratings: await prismaBase.ratingRecord.count({ where }),
    participants: await prismaBase.tournamentParticipant.count({ where }),
    assignments: await prismaBase.assignment.count({ where }),
    analyses: await prismaBase.gameAnalysis.count({ where }),
  };
}

// Anything written under A that points at B's rows is a leak too.
async function crossLinksFromA() {
  return {
    enrolments: await prismaBase.classroomStudent.count({ where: { tenantId: A, studentId: ids.studentB } }),
    invoices: await prismaBase.invoice.count({ where: { tenantId: A, studentId: ids.studentB } }),
    ratings: await prismaBase.ratingRecord.count({ where: { tenantId: A, studentId: ids.studentB } }),
    participants: await prismaBase.tournamentParticipant.count({ where: { tenantId: A, studentId: ids.studentB } }),
    assignments: await prismaBase.assignment.count({ where: { tenantId: A, classroomId: ids.classroomB } }),
    links: await prismaBase.parentStudent.count({ where: { tenantId: A, parentId: ids.parentB } }),
  };
}

let before: Awaited<ReturnType<typeof snapshotB>>;

beforeAll(async () => {
  await prismaBase.tenant.createMany({
    data: [
      { id: A, name: `A ${RUN}`, subdomain: A, timezone: "UTC" },
      { id: B, name: `B ${RUN}`, subdomain: B, timezone: "UTC" },
    ],
  });
  const user = (tenantId: string, role: string, tag: string) =>
    prismaBase.user.create({
      data: { tenantId, role: role as never, email: `${tag}-${RUN}@example.test`, timezone: "UTC", authProviderId: `xt-${tag}-${RUN}` },
    });

  const [adminA, uStudentA, uStudentB, uParentB, uCoachB] = await Promise.all([
    user(A, "ACADEMY_ADMIN", "admin-a"),
    user(A, "STUDENT", "student-a"),
    user(B, "STUDENT", "student-b"),
    user(B, "PARENT", "parent-b"),
    user(B, "COACH", "coach-b"),
  ]);
  ids.adminA = adminA.id;
  ids.studentA = (await prismaBase.studentProfile.create({ data: { tenantId: A, userId: uStudentA.id } })).id;
  ids.studentB = (await prismaBase.studentProfile.create({ data: { tenantId: B, userId: uStudentB.id } })).id;
  ids.parentB = (await prismaBase.parentProfile.create({ data: { tenantId: B, userId: uParentB.id } })).id;
  ids.coachB = (await prismaBase.coachProfile.create({ data: { tenantId: B, userId: uCoachB.id } })).id;

  ids.classroomA = (await prismaBase.classroom.create({ data: { tenantId: A, name: "A room" } })).id;
  ids.classroomB = (await prismaBase.classroom.create({ data: { tenantId: B, name: "B room" } })).id;
  await prismaBase.classroomStudent.create({ data: { tenantId: B, classroomId: ids.classroomB, studentId: ids.studentB } });

  const future = new Date(Date.now() + 7 * 86_400_000);
  const liveSession = (tenantId: string, classroomId: string) =>
    prismaBase.liveSession.create({
      data: { tenantId, classroomId, scheduledAtUtc: future, durationMins: 60, socketRoomId: randomUUID() },
    });
  ids.sessionA = (await liveSession(A, ids.classroomA)).id;
  ids.sessionB = (await liveSession(B, ids.classroomB)).id;

  ids.slotB = (
    await prismaBase.classroomScheduleSlot.create({
      data: { tenantId: B, classroomId: ids.classroomB, dayOfWeek: 6, localTime: "10:00", timezone: "UTC", durationMins: 60 },
    })
  ).id;
  ids.blockB = (
    await prismaBase.calendarBlock.create({
      data: { tenantId: B, kind: "HOLIDAY", title: "B closed", startsAtUtc: future, endsAtUtc: new Date(future.getTime() + 86_400_000), timezone: "UTC" },
    })
  ).id;
  ids.folderB = (await prismaBase.pgnFolder.create({ data: { tenantId: B, name: "B openings" } })).id;
  ids.fileB = (
    await prismaBase.pgnFile.create({
      data: { tenantId: B, folderId: ids.folderB, name: "b.pgn", content: "1. e4 e5 *", sizeBytes: 10 },
    })
  ).id;
  ids.tournamentB = (
    await prismaBase.tournament.create({
      data: { tenantId: B, name: "B open", format: "SWISS", socketRoomId: randomUUID(), startsAtUtc: future },
    })
  ).id;
  ids.gameB = (
    await prismaBase.game.create({
      data: { tenantId: B, studentId: ids.studentB, source: "LICHESS", pgn: "1. e4 *", playedAtUtc: new Date(), result: "*" },
    })
  ).id;
  ids.linkB = (await prismaBase.parentStudent.create({ data: { tenantId: B, parentId: ids.parentB, studentId: ids.studentB } })).id;

  session = {
    id: adminA.id,
    authProviderId: adminA.authProviderId,
    tenantId: A,
    role: "ACADEMY_ADMIN",
    email: adminA.email,
    displayName: null,
    timezone: "UTC",
    mustSetPassword: false,
  };

  before = await snapshotB();
  requireTenantContext(true);
});

afterAll(async () => {
  requireTenantContext(false);
  const where = { tenantId: { in: [A, B] } };
  await prismaBase.xpEvent.deleteMany({ where });
  await prismaBase.studentBadge.deleteMany({ where });
  await prismaBase.attendanceRecord.deleteMany({ where });
  await prismaBase.liveSessionChange.deleteMany({ where });
  await prismaBase.ratingRecord.deleteMany({ where });
  await prismaBase.tournamentParticipant.deleteMany({ where });
  await prismaBase.tournament.deleteMany({ where });
  await prismaBase.gameAnalysis.deleteMany({ where });
  await prismaBase.game.deleteMany({ where });
  await prismaBase.invoice.deleteMany({ where });
  await prismaBase.parentStudent.deleteMany({ where });
  await prismaBase.classroomStudent.deleteMany({ where });
  await prismaBase.classroomCoach.deleteMany({ where });
  await prismaBase.assignmentPuzzle.deleteMany({ where });
  await prismaBase.assignment.deleteMany({ where });
  await prismaBase.liveSession.deleteMany({ where });
  await prismaBase.classroomScheduleSlot.deleteMany({ where });
  await prismaBase.calendarBlock.deleteMany({ where });
  await prismaBase.classroom.deleteMany({ where });
  await prismaBase.pgnFile.deleteMany({ where });
  await prismaBase.pgnFolder.deleteMany({ where });
  await prismaBase.parentProfile.deleteMany({ where });
  await prismaBase.studentProfile.deleteMany({ where });
  await prismaBase.coachProfile.deleteMany({ where });
  await prismaBase.user.deleteMany({ where });
  await prismaBase.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await prismaBase.$disconnect();
});

describe("Academy A's admin, holding Academy B's ids", () => {
  it("can't enrol B's student in A's classroom, or A's student in B's", async () => {
    await expectRefused(() => classrooms.enrollStudentAction(form({ classroomId: ids.classroomA, profileId: ids.studentB })));
    await expectRefused(() => classrooms.enrollStudentAction(form({ classroomId: ids.classroomB, profileId: ids.studentA })));
  });

  it("can't cancel, rename the link of, or remove the schedule of B's classroom", async () => {
    await expectRefused(() =>
      classrooms.cancelSessionAction(form({ classroomId: ids.classroomB, liveSessionId: ids.sessionB }))
    );
    await expectRefused(() =>
      classrooms.cancelSessionAction(form({ classroomId: ids.classroomA, liveSessionId: ids.sessionB }))
    );
    await expectRefused(() =>
      classrooms.setMeetingUrlAction(form({ classroomId: ids.classroomB, meetingUrl: "https://meet.google.com/abc-defg-hij" }))
    );
    await expectRefused(() =>
      classrooms.removeScheduleSlotAction(form({ classroomId: ids.classroomB, scheduleSlotId: ids.slotB }))
    );
  });

  it("can't mark attendance on B's session", async () => {
    const fd = form({ classroomId: ids.classroomB, liveSessionId: ids.sessionB, studentIds: ids.studentB });
    fd.set(`present:${ids.studentB}`, "on");
    await expectRefused(() => attendance.markAttendanceAction(fd));
  });

  it("can't invoice B's student", async () => {
    await expectRefused(() =>
      billing.createInvoiceAction(
        form({
          studentId: ids.studentB,
          amountMajorUnits: "50",
          currency: "USD",
          provider: "STRIPE",
          dueLocalDate: "2099-01-01",
          description: "Tuition",
          idempotencyKey: randomUUID(),
        })
      )
    );
  });

  it("can't cancel B's class or delete B's calendar entry from the calendar", async () => {
    await expectRefused(() => calendar.cancelClassAction({ sessionId: ids.sessionB, scope: "THIS" }));
    await expectRefused(() => calendar.deleteCalendarBlockAction({ id: ids.blockB }));
  });

  it("can't link or unlink B's parents and students", async () => {
    await expectRefused(() =>
      members.linkParentStudent(form({ parentProfileId: ids.parentB, studentProfileId: ids.studentB }))
    );
    await expectRefused(() => members.unlinkParentStudent(ids.linkB));
  });

  it("can't rename, share, delete or download B's PGN material", async () => {
    await expectRefused(() => pgn.renameFolderAction(form({ folderId: ids.folderB, name: "mine now" })));
    await expectRefused(() => pgn.setFolderSharedAction(form({ folderId: ids.folderB, isShared: "on" })));
    await expectRefused(() => pgn.deleteFolderAction(form({ folderId: ids.folderB })));
    await expectRefused(() => pgn.renameFileAction(form({ fileId: ids.fileB, name: "x.pgn" })));
    await expectRefused(() => pgn.deleteFileAction(form({ fileId: ids.fileB })));

    const res = await pgnDownload.GET(new Request("http://a.localhost/x"), { params: { fileId: ids.fileB } });
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("1. e4 e5");
  });

  it("can't record a rating for B's student", async () => {
    await expectRefused(() =>
      students.recordRatingAction(form({ studentId: ids.studentB, federation: "FIDE", rating: "1500" }))
    );
  });

  it("can't register B's student, or anyone into B's tournament", async () => {
    await expectRefused(() =>
      tournaments.registerParticipantAction(form({ tournamentId: ids.tournamentB, studentId: ids.studentA }))
    );
    await expectRefused(() => tournaments.generateRoundAction(form({ tournamentId: ids.tournamentB })));
  });

  it("can't set homework in B's classroom", async () => {
    const fd = form({ classroomId: ids.classroomB, title: "Forks" });
    fd.append("puzzleIds", "any-puzzle");
    await expectRefused(() => homework.createAssignmentAction(fd));
  });

  it("can't queue analysis of B's game", async () => {
    await expectRefused(() => games.requestGameAnalysisAction(form({ gameId: ids.gameB })));
  });

  it("left every one of B's rows as it was, and wrote nothing under A pointing at B", async () => {
    expect(await snapshotB()).toEqual(before);
    expect(await crossLinksFromA()).toEqual({
      enrolments: 0,
      invoices: 0,
      ratings: 0,
      participants: 0,
      assignments: 0,
      links: 0,
    });
  });
});

// Without these, a harness that refuses everything would pass the suite above.
describe("positive controls: the same actions with A's own ids", () => {
  it("enrols A's student in A's classroom", async () => {
    await expect(
      classrooms.enrollStudentAction(form({ classroomId: ids.classroomA, profileId: ids.studentA }))
    ).resolves.toMatchObject({ ok: true });
  });

  it("records a rating for A's student", async () => {
    await expect(
      students.recordRatingAction(form({ studentId: ids.studentA, federation: "FIDE", rating: "1500" }))
    ).resolves.toMatchObject({ ok: true });
  });

  it("cancels A's own session", async () => {
    await expect(
      classrooms.cancelSessionAction(form({ classroomId: ids.classroomA, liveSessionId: ids.sessionA }))
    ).resolves.toMatchObject({ ok: true });
  });
});
