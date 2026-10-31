import { prisma } from "@chessplay-clone/db";
import { displayName } from "../lib/displayName";

// The activity feed, assembled from rows that already carry a timestamp.
//
// There is no ActivityLog table in this schema, and adding one would mean a
// migration plus a write in every server action — and then a feed that stayed
// empty until new events happened to occur. Reading the timestamps the domain
// already records gives a feed that is true on day one and works backwards
// over everything the academy has ever done.
//
// What it costs: only three of these sources name an actor (Invoice.createdBy,
// Certificate.issuedBy, RatingRecord.recordedBy). The rest genuinely do not
// record who did it, so those entries describe what happened without
// attributing it. Inventing a name would be worse than omitting one.
//
// Tournament is absent on purpose: it has no createdAt, and its startsAtUtc is
// a future date, so it has no "when this happened" to sort by.

export type ActivityKind =
  | "classroom-created"
  | "student-joined"
  | "homework-assigned"
  | "attendance-marked"
  | "invoice-paid"
  | "certificate-issued"
  | "rating-recorded";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  at: Date;
  /** Who did it, when the row records that. Null is normal, not a failure. */
  actor: string | null;
  /** What it was done to: a classroom name, a student's name, a title. */
  subject: string;
}

const PER_SOURCE_LIMIT = 10;

export async function getRecentActivity(tenantId: string, take = 8): Promise<ActivityEntry[]> {
  const [classrooms, students, assignments, attendance, invoices, certificates, ratings] =
    await Promise.all([
      prisma.classroom.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_LIMIT,
      }),
      prisma.user.findMany({
        where: { tenantId, role: "STUDENT", deletedAt: null },
        select: { id: true, email: true, displayName: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_LIMIT,
      }),
      prisma.assignment.findMany({
        where: { tenantId },
        select: { id: true, title: true, createdAt: true, classroom: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_LIMIT,
      }),
      // One entry per session, not per student: a coach marking a register of
      // twenty would otherwise bury every other kind of event on the page.
      prisma.attendanceRecord.findMany({
        where: { tenantId },
        select: {
          id: true,
          markedAtUtc: true,
          liveSessionId: true,
          liveSession: { select: { classroom: { select: { name: true } } } },
        },
        orderBy: { markedAtUtc: "desc" },
        take: PER_SOURCE_LIMIT * 20,
      }),
      prisma.invoice.findMany({
        where: { tenantId, status: "PAID", paidAtUtc: { not: null } },
        select: {
          id: true,
          paidAtUtc: true,
          student: { select: { user: { select: { email: true, displayName: true } } } },
        },
        orderBy: { paidAtUtc: "desc" },
        take: PER_SOURCE_LIMIT,
      }),
      prisma.certificate.findMany({
        where: { tenantId },
        select: {
          id: true,
          issuedAtUtc: true,
          issuedBy: { select: { email: true, displayName: true } },
          student: { select: { user: { select: { email: true, displayName: true } } } },
        },
        orderBy: { issuedAtUtc: "desc" },
        take: PER_SOURCE_LIMIT,
      }),
      prisma.ratingRecord.findMany({
        where: { tenantId },
        select: {
          id: true,
          recordedAtUtc: true,
          federation: true,
          rating: true,
          recordedBy: { select: { email: true, displayName: true } },
          student: { select: { user: { select: { email: true, displayName: true } } } },
        },
        orderBy: { recordedAtUtc: "desc" },
        take: PER_SOURCE_LIMIT,
      }),
    ]);

  const seenSessions = new Set<string>();
  const entries: ActivityEntry[] = [
    ...classrooms.map((c) => ({
      id: `classroom:${c.id}`,
      kind: "classroom-created" as const,
      at: c.createdAt,
      actor: null,
      subject: c.name,
    })),
    ...students.map((s) => ({
      id: `student:${s.id}`,
      kind: "student-joined" as const,
      at: s.createdAt,
      actor: null,
      subject: displayName(s),
    })),
    ...assignments.map((a) => ({
      id: `assignment:${a.id}`,
      kind: "homework-assigned" as const,
      at: a.createdAt,
      actor: null,
      subject: `${a.title} · ${a.classroom.name}`,
    })),
    ...attendance.flatMap((r) => {
      if (seenSessions.has(r.liveSessionId)) return [];
      seenSessions.add(r.liveSessionId);
      return [
        {
          id: `attendance:${r.liveSessionId}`,
          kind: "attendance-marked" as const,
          at: r.markedAtUtc,
          actor: null,
          subject: r.liveSession.classroom.name,
        },
      ];
    }),
    ...invoices.map((i) => ({
      id: `invoice:${i.id}`,
      kind: "invoice-paid" as const,
      // Filtered to non-null above; the column is nullable because a pending
      // invoice has not been paid.
      at: i.paidAtUtc as Date,
      actor: null,
      subject: displayName(i.student.user),
    })),
    ...certificates.map((c) => ({
      id: `certificate:${c.id}`,
      kind: "certificate-issued" as const,
      at: c.issuedAtUtc,
      actor: c.issuedBy ? displayName(c.issuedBy) : null,
      subject: displayName(c.student.user),
    })),
    ...ratings.map((r) => ({
      id: `rating:${r.id}`,
      kind: "rating-recorded" as const,
      at: r.recordedAtUtc,
      actor: r.recordedBy ? displayName(r.recordedBy) : null,
      subject: `${displayName(r.student.user)} · ${r.federation} ${r.rating}`,
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

/** The sentence shown beside each entry. Subject is rendered separately. */
export const ACTIVITY_VERB: Record<ActivityKind, string> = {
  "classroom-created": "Classroom created",
  "student-joined": "Student joined",
  "homework-assigned": "Homework assigned",
  "attendance-marked": "Attendance marked",
  "invoice-paid": "Invoice paid",
  "certificate-issued": "Certificate issued",
  "rating-recorded": "Rating recorded",
};
