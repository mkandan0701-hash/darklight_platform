import Link from "next/link";
import { Card } from "../ui/Card";
import { RankProgressBar } from "../ui/RankProgressBar";
import { textLinkClass } from "../ui/styles";
import { formatAttendanceRate } from "../../lib/attendance";

/**
 * One child's row on a parent's dashboard — the way in to their portal page.
 *
 * Kept out of dashboard/page.tsx because that file already carries three role
 * branches; the parent's was sixty lines of inline markup for what is
 * structurally a list row.
 */
export function ChildSummaryCard({
  studentId,
  name,
  attendance,
  homeworkDone,
  homeworkTotal,
}: {
  studentId: string;
  name: string;
  attendance: { attendedCount: number; sessionCount: number };
  homeworkDone: number;
  homeworkTotal: number;
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <Link href={`/dashboard/children/${studentId}`} className={textLinkClass}>
        {name}
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <RankProgressBar
          completed={attendance.attendedCount}
          total={attendance.sessionCount}
          label={`${name} attended ${attendance.attendedCount} of ${attendance.sessionCount} sessions`}
        />
        <span className="text-xs text-slate">
          {/* formatAttendanceRate renders "—" rather than 0% when nothing has
              been marked — a new joiner has no rate, not a bad one. */}
          {attendance.sessionCount === 0
            ? "no attendance marked yet"
            : `${formatAttendanceRate(
                attendance.attendedCount,
                attendance.sessionCount
              )} attendance`}
        </span>
        <span className="text-xs text-slate">
          {homeworkTotal === 0
            ? "no homework yet"
            : `${homeworkDone} of ${homeworkTotal} recent assignments complete`}
        </span>
      </div>
    </Card>
  );
}
