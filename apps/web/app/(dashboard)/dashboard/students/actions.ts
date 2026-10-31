"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { TenantMismatchError } from "../../../../lib/auth/errors";
import { zonedLocalToUtc, formatInZone } from "../../../../lib/time";
import { formatAttendanceRate } from "../../../../lib/attendance";
import { displayName } from "../../../../lib/displayName";
import { renderCertificatePdf } from "../../../../lib/pdf/certificateTemplates";
import { uploadCertificatePdf } from "../../../../lib/storage/r2Client";
import { recordRating, getLatestRatingByFederation } from "../../../../repositories/ratingRepository";
import { createCertificate } from "../../../../repositories/certificateRepository";
import { getStudentAttendanceSummary } from "../../../../repositories/attendanceRepository";
import { getStudentProfile } from "../../../../repositories/userRepository";
import { getTenantById } from "../../../../repositories/tenantRepository";

type ActionResult = { ok: true } | { ok: false; error: string };

const FEDERATIONS = ["FIDE", "USCF", "ECF"] as const;

const RecordRatingSchema = z.object({
  studentId: z.string().min(1),
  federation: z.enum(FEDERATIONS),
  // Upper bound is a typo guard, not a rule about chess: no rated human has
  // passed 2900, so a four-digit fat-finger is far likelier than a real value.
  rating: z.coerce.number().int().positive().max(3500),
});

export async function recordRatingAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    // Same role set as marking attendance and assigning homework: recording an
    // official rating is routine academic record-keeping a coach does after an
    // event, not a money decision like invoicing (which is admin-only).
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can record ratings" };
  }

  const parsed = RecordRatingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await recordRating({
      tenantId: session.tenantId,
      studentId: parsed.data.studentId,
      federation: parsed.data.federation,
      rating: parsed.data.rating,
      recordedByUserId: session.id,
    });
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That student isn't part of your academy" };
    }
    throw err;
  }

  revalidatePath("/dashboard/students");
  return { ok: true };
}

const GenerateCertificateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ATTENDANCE"), studentId: z.string().min(1) }),
  z.object({
    type: z.literal("RATING_MILESTONE"),
    studentId: z.string().min(1),
    federation: z.enum(FEDERATIONS),
  }),
  z.object({
    type: z.literal("TOURNAMENT_RESULT"),
    studentId: z.string().min(1),
    eventName: z.string().min(1).max(200),
    eventResult: z.string().min(1).max(200),
    eventLocalDate: z.string().min(1),
  }),
]);

export async function generateCertificateAction(formData: FormData): Promise<ActionResult> {
  const session = await getCurrentSession();
  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    return { ok: false, error: "Only admins or coaches can issue certificates" };
  }

  const parsed = GenerateCertificateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [student, tenant] = await Promise.all([
    getStudentProfile(session.tenantId, parsed.data.studentId),
    getTenantById(session.tenantId),
  ]);
  if (!student || !tenant) {
    return { ok: false, error: "That student isn't part of your academy" };
  }

  const shell = {
    studentName: displayName(student.user),
    academyName: tenant.name,
    logoUrl: tenant.logoUrl,
    brandColor: tenant.brandColor,
    issuedOn: formatInZone(new Date(), session.timezone),
  };

  let pdf: Buffer;
  let eventFields: { eventName?: string; eventResult?: string; eventDateUtc?: Date } = {};

  try {
    if (parsed.data.type === "ATTENDANCE") {
      const summary = await getStudentAttendanceSummary(session.tenantId, student.id);
      pdf = await renderCertificatePdf({
        ...shell,
        type: "ATTENDANCE",
        attendedCount: summary.attendedCount,
        sessionCount: summary.sessionCount,
        // Reused, not reimplemented: a second percentage rule here would
        // eventually disagree with the one the parent portal shows.
        attendanceRate: formatAttendanceRate(summary.attendedCount, summary.sessionCount),
      });
    } else if (parsed.data.type === "RATING_MILESTONE") {
      const latest = await getLatestRatingByFederation(session.tenantId, student.id);
      const record = latest.get(parsed.data.federation);
      if (!record) {
        return {
          ok: false,
          error: `No ${parsed.data.federation} rating on file for this student yet`,
        };
      }
      const federationId =
        parsed.data.federation === "FIDE"
          ? student.fideId
          : parsed.data.federation === "USCF"
            ? student.uscfId
            : student.eclId;
      pdf = await renderCertificatePdf({
        ...shell,
        type: "RATING_MILESTONE",
        federation: parsed.data.federation,
        rating: record.rating,
        federationId,
        recordedOn: formatInZone(record.recordedAtUtc, session.timezone),
      });
    } else {
      const eventDateUtc = zonedLocalToUtc(
        `${parsed.data.eventLocalDate}T12:00`,
        session.timezone
      );
      eventFields = {
        eventName: parsed.data.eventName,
        eventResult: parsed.data.eventResult,
        eventDateUtc,
      };
      pdf = await renderCertificatePdf({
        ...shell,
        type: "TOURNAMENT_RESULT",
        eventName: parsed.data.eventName,
        eventResult: parsed.data.eventResult,
        eventDate: formatInZone(eventDateUtc, session.timezone),
      });
    }
  } catch {
    return { ok: false, error: "Could not build the certificate — please try again" };
  }

  // Render and upload before the DB write, for the same reason
  // createInvoiceAction calls Stripe first: a Certificate row whose pdfUrl
  // points at an object that was never uploaded is a broken link on a
  // document a family may go looking for years later.
  let pdfUrl: string;
  try {
    const key = `certificates/${session.tenantId}/${student.id}/${crypto.randomUUID()}.pdf`;
    pdfUrl = await uploadCertificatePdf(key, pdf);
  } catch {
    return { ok: false, error: "Could not store the certificate — please try again" };
  }

  try {
    await createCertificate({
      tenantId: session.tenantId,
      studentId: student.id,
      type: parsed.data.type,
      pdfUrl,
      issuedByUserId: session.id,
      ...eventFields,
    });
  } catch (err) {
    if (err instanceof TenantMismatchError) {
      return { ok: false, error: "That student isn't part of your academy" };
    }
    throw err;
  }

  revalidatePath("/dashboard/students");
  return { ok: true };
}
