import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentSession } from "../../../../lib/auth/session";
import { requireRole } from "../../../../lib/auth/requireRole";
import { formatInZone } from "../../../../lib/time";
import { displayName } from "../../../../lib/displayName";
import {
  listParentsAndStudents,
  getStudentProfileByUserId,
} from "../../../../repositories/userRepository";
import { listRatingsForStudent } from "../../../../repositories/ratingRepository";
import { getStudentProgress } from "../../../../repositories/gamificationRepository";
import { findBadge } from "../../../../lib/gamification/rules";
import {
  listCertificatesForStudent,
  listCertificatesForTenant,
} from "../../../../repositories/certificateRepository";
import { RecordRatingForm } from "./RecordRatingForm";
import { GenerateCertificateForm } from "./GenerateCertificateForm";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import {
  pageHeadingClass,
  sectionHeadingClass,
  textLinkClass,
} from "../../../../components/ui/styles";

const CERTIFICATE_LABEL: Record<string, string> = {
  ATTENDANCE: "Attendance",
  RATING_MILESTONE: "Rating achievement",
  TOURNAMENT_RESULT: "Tournament result",
};

export default async function StudentsPage() {
  const session = await getCurrentSession();

  // A student sees their own record, read-only — the same shape the Billing
  // page takes for its STUDENT branch.
  if (session.role === "STUDENT") {
    const profile = await getStudentProfileByUserId(session.tenantId, session.id);
    const [ratings, certificates, progress] = profile
      ? await Promise.all([
          listRatingsForStudent(session.tenantId, profile.id),
          listCertificatesForStudent(session.tenantId, profile.id),
          getStudentProgress(session.tenantId, profile.id),
        ])
      : [[], [], null];

    return (
      <div>
        <h1 className={pageHeadingClass}>My record</h1>

        {progress && (
          <section className="mt-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="p-4">
                <p className="font-display text-2xl font-bold text-ink">{progress.xp}</p>
                <p className="text-xs uppercase tracking-wide text-slate">XP</p>
              </Card>
              <Card className="p-4">
                <p className="font-display text-2xl font-bold text-ink">
                  {progress.puzzlesSolved}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate">Puzzles solved</p>
              </Card>
              <Card className="p-4">
                <p className="font-display text-2xl font-bold text-ink">
                  {progress.classesAttended}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate">Classes attended</p>
              </Card>
            </div>

            {progress.badges.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {progress.badges.map((badge) => {
                  const definition = findBadge(badge.code);
                  return (
                    <Badge key={badge.id} tone="warn" title={definition?.description}>
                      {definition?.label ?? badge.code}
                    </Badge>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <section className="mt-6">
          <h2 className={sectionHeadingClass}>Ratings</h2>
          {ratings.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No ratings on file yet"
                description="Your coach records your official FIDE, USCF or ECF rating here after rated events."
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {ratings.map((r) => (
                <Card key={r.id} className="flex items-center justify-between p-4">
                  <span className="text-sm text-ink">
                    <Badge>{r.federation}</Badge> <span className="ml-2 font-mono">{r.rating}</span>
                  </span>
                  <span className="text-xs text-slate">
                    {formatInZone(r.recordedAtUtc, session.timezone)}
                  </span>
                </Card>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className={sectionHeadingClass}>Certificates</h2>
          {certificates.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No certificates yet"
                description="Certificates your academy issues — useful for college applications — will appear here to download."
              />
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {certificates.map((c) => (
                <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <a href={c.pdfUrl} target="_blank" rel="noreferrer" className={textLinkClass}>
                    {CERTIFICATE_LABEL[c.type] ?? c.type}
                    {c.eventName ? ` — ${c.eventName}` : ""}
                  </a>
                  <span className="text-xs text-slate">
                    Issued {formatInZone(c.issuedAtUtc, session.timezone)}
                  </span>
                </Card>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  try {
    requireRole(session, ["ACADEMY_ADMIN", "COACH"]);
  } catch {
    // A parent reads their child's record on that child's own page, where the
    // ParentStudent link is already checked — same split as Homework/Billing.
    notFound();
  }

  const [{ students }, certificates] = await Promise.all([
    listParentsAndStudents(session.tenantId),
    listCertificatesForTenant(session.tenantId),
  ]);
  const studentOptions = students.map((s) => ({ id: s.id, label: displayName(s.user) }));

  return (
    <div>
      <h1 className={pageHeadingClass}>Students</h1>
      <p className="mt-1 text-sm text-slate">
        Official ratings and college-application certificates, per student.
      </p>

      <section className="mt-6">
        <h2 className={sectionHeadingClass}>Record a rating</h2>
        <Card className="mt-3">
          <RecordRatingForm students={studentOptions} />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Issue a certificate</h2>
        <Card className="mt-3">
          <GenerateCertificateForm students={studentOptions} />
        </Card>
      </section>

      <section className="mt-8">
        <h2 className={sectionHeadingClass}>Issued certificates</h2>
        {certificates.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No certificates issued yet"
              description="Generate one above — students and their parents can download it from their own pages."
            />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {certificates.map((c) => (
              <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <a href={c.pdfUrl} target="_blank" rel="noreferrer" className={textLinkClass}>
                    {CERTIFICATE_LABEL[c.type] ?? c.type}
                    {c.eventName ? ` — ${c.eventName}` : ""}
                  </a>
                  <p className="text-xs text-slate">{displayName(c.student.user)}</p>
                </div>
                <span className="text-xs text-slate">
                  Issued {formatInZone(c.issuedAtUtc, session.timezone)}
                </span>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-xs text-slate">
        Looking for a single student&rsquo;s full history?{" "}
        <Link href="/dashboard/classrooms" className={textLinkClass}>
          Open their classroom
        </Link>{" "}
        to see attendance and homework alongside it.
      </p>
    </div>
  );
}
