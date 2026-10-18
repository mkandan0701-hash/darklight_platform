import { Card } from "../../../../components/ui/Card";
import { LineChart } from "../../../../components/charts/LineChart";
import { Clock, Percent, User, UserMinus } from "../../../../components/ui/icons";
import { attendanceSplit, formatRate, mean, type ChartPoint } from "../../../../lib/metrics";
import { getEngagement } from "../../../../repositories/dashboardMetricsRepository";
import { MetricTile, PanelError, PanelHeading } from "./WidgetChrome";

/**
 * Classroom &amp; Engagement over the last 30 days.
 *
 * Three of these four numbers have a trap in them, and each is handled rather
 * than papered over:
 *
 * - Attendance and no-show divide by rows a coach actually marked, never by
 *   classes scheduled. An academy that has marked nothing shows "—" on both,
 *   not 0% and 100% — the latter accuses every student of missing every class
 *   when the real answer is that nobody has taken a register yet.
 * - Session duration is *scheduled* minutes. LiveSession has no startedAt or
 *   endedAt, so what actually happened is not recorded anywhere, and the label
 *   says scheduled so the number is not mistaken for delivery.
 * - Active/inactive has no stored definition in this schema, so it is
 *   behavioural over the same 30 days; the tooltip states the rule.
 */
export async function EngagementCard({
  tenantId,
  zone,
  now,
}: {
  tenantId: string;
  zone: string;
  now: Date;
}) {
  let data;
  try {
    data = await getEngagement(tenantId, zone, now);
  } catch (err) {
    console.error("Engagement query failed", err);
    return <PanelError title="Classroom & Engagement" />;
  }

  const split = attendanceSplit(data.attendance);
  const avgDuration = mean(data.durations);

  // A week nobody marked has no rate, and is plotted as a gap rather than a
  // zero — a zero would draw a collapse in attendance that never happened,
  // when the truth is that nobody took a register that week.
  const weekly = data.weeklyAttendance.map((w) => ({
    label: w.label,
    split: attendanceSplit(w.records),
  }));
  const plotted: ChartPoint[] = weekly.map((w) => ({
    label: w.label,
    value: w.split.presentRate,
  }));
  const anyMarked = weekly.some((w) => w.split.marked > 0);

  return (
    <Card>
      <PanelHeading
        title="Classroom & Engagement"
        aside={<span className="text-xs font-normal text-slate">(Last 30 Days)</span>}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Percent}
          tone="people"
          value={formatRate(split.presentRate)}
          label="Attendance Rate"
          title={
            split.marked === 0
              ? "No attendance has been marked in the last 30 days, so there is no rate to show."
              : `Present in ${split.present} of ${split.marked} marked records. Classes nobody marked are not counted as absences.`
          }
        />
        <MetricTile
          icon={UserMinus}
          tone="compete"
          value={formatRate(split.noShowRate)}
          label="No-Show Rate"
          title={
            split.marked === 0
              ? "No attendance has been marked in the last 30 days, so there is no rate to show."
              : `Marked absent in ${split.absent} of ${split.marked} records — the complement of the attendance rate.`
          }
        />
        <MetricTile
          icon={Clock}
          tone="schedule"
          value={avgDuration === null ? "—" : `${avgDuration} min`}
          label="Avg Session Length"
          title="The average length classes were scheduled for. Actual start and end times are not recorded."
        />
        <MetricTile
          icon={User}
          tone="work"
          value={`${data.activeStudents} / ${data.totalStudents}`}
          label="Active / Total"
          title="Students who attended a class, attempted a puzzle, played a game or earned XP in the last 30 days."
        />
      </div>

      <h3 className="mt-6 text-sm font-medium text-ink">Attendance Trend (Last 8 Weeks)</h3>
      {anyMarked ? (
        <div className="mt-3">
          <LineChart
            points={plotted}
            unit="%"
            maxOverride={100}
            ariaLabel="Weekly attendance rate over the last eight weeks"
            height={170}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate">
          No attendance has been marked in the last eight weeks, so there is no trend to plot yet.
        </p>
      )}
    </Card>
  );
}
