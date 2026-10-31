import { StatCard } from "../../../../components/ui/StatCard";
import {
  BookOpen,
  CalendarDays,
  GraduationCap,
  Trophy,
  UserPlus,
  Users,
} from "../../../../components/ui/icons";
import { formatComparison, formatGrowth } from "../../../../lib/metrics";
import { getStatCounts } from "../../../../repositories/dashboardMetricsRepository";
import { PanelError } from "./WidgetChrome";

/**
 * The six headline numbers.
 *
 * The reference's sixth card is "Courses Published". This product has no
 * Course or Lesson model — nothing to count — and rendering a hardcoded zero
 * would read as "your academy has published no courses" rather than "this
 * feature does not exist". Homework takes the slot instead: Assignment is the
 * teaching-content object this app actually has, and both its number and its
 * supporting line come from real columns.
 */
export async function AdminStatCards({
  tenantId,
  zone,
  now,
}: {
  tenantId: string;
  zone: string;
  now: Date;
}) {
  let stats;
  try {
    stats = await getStatCounts(tenantId, zone, now);
  } catch (err) {
    console.error("Dashboard stat counts failed", err);
    return <PanelError title="Academy at a glance" />;
  }

  const monthGrowth = formatGrowth(stats.newStudentsThisMonth, "this month");
  const weekChange = formatComparison(
    stats.newStudentsThisWeek,
    stats.newStudentsLastWeek,
    "vs last week"
  );
  const classChange = formatComparison(
    stats.sessionsThisWeek,
    stats.sessionsLastWeek,
    "vs last week"
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={Users}
        tone="people"
        value={String(stats.totalStudents)}
        label="Total Students"
        note={monthGrowth.text}
        noteTone={monthGrowth.tone}
        title="Student accounts in this academy that have not been deactivated."
      />
      <StatCard
        icon={UserPlus}
        tone="people"
        value={String(stats.newStudentsThisWeek)}
        label="New This Week"
        note={weekChange.text}
        noteTone={weekChange.tone}
        title="Student accounts created since Monday, in the academy's timezone."
      />
      <StatCard
        icon={GraduationCap}
        tone="schedule"
        value={String(stats.liveNow)}
        label="Active Classes"
        note={`${stats.sessionsToday} today`}
        title="Classes running right now — started, and not yet past their scheduled end."
      />
      <StatCard
        icon={CalendarDays}
        tone="schedule"
        value={String(stats.sessionsThisWeek)}
        label="Classes This Week"
        note={classChange.text}
        noteTone={classChange.tone}
        title="Classes scheduled this week, excluding cancelled ones."
      />
      <StatCard
        icon={Trophy}
        tone="compete"
        value={String(stats.tournamentsTotal)}
        label="Tournaments"
        note={`${stats.tournamentsUpcoming} upcoming`}
        title="Every tournament this academy has run; upcoming ones are still to start."
      />
      <StatCard
        icon={BookOpen}
        tone="work"
        value={String(stats.assignmentsTotal)}
        label="Homework Assigned"
        note={`${stats.assignmentsDueThisWeek} due this week`}
        title="Assignments created for this academy's classrooms."
      />
    </div>
  );
}
