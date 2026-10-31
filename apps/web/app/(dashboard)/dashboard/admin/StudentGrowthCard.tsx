import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { LineChart } from "../../../../components/charts/LineChart";
import { bucketByDay, bucketByMonth } from "../../../../lib/metrics";
import {
  getStudentSignups,
  type GrowthRange,
} from "../../../../repositories/dashboardMetricsRepository";
import { PanelError, PanelHeading } from "./WidgetChrome";

const RANGES: { value: GrowthRange; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

export function parseGrowthRange(value: string | undefined): GrowthRange {
  return RANGES.some((r) => r.value === value) ? (value as GrowthRange) : "week";
}

/**
 * The range selector.
 *
 * Links rather than buttons, so switching range is a navigation: no client
 * component, no JavaScript, keyboard-operable for free, and the chosen view
 * survives a reload and can be sent to someone. The page re-renders on the
 * server with the range in the query string.
 */
function RangeTabs({ active }: { active: GrowthRange }) {
  return (
    <nav aria-label="Student growth range" className="ml-auto flex rounded-lg bg-parchment p-0.5">
      {RANGES.map((range) => {
        const selected = range.value === active;
        return (
          <Link
            key={range.value}
            href={`/dashboard?growth=${range.value}`}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
              selected
                ? "bg-white text-ink shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            {range.label}
          </Link>
        );
      })}
    </nav>
  );
}

export async function StudentGrowthCard({
  tenantId,
  zone,
  range,
  now,
}: {
  tenantId: string;
  zone: string;
  range: GrowthRange;
  now: Date;
}) {
  let signups;
  try {
    signups = await getStudentSignups(tenantId, zone, range, now);
  } catch (err) {
    console.error("Student growth query failed", err);
    return <PanelError title="Student Growth" />;
  }

  // A year is twelve months; a week and a month are both plotted by day. A
  // month by week would hide the shape of a recruitment push.
  const points =
    range === "year"
      ? bucketByMonth(signups.timestamps, signups.period, zone)
      : bucketByDay(
          signups.timestamps,
          signups.period,
          zone,
          range === "week" ? "weekday" : "date"
        );

  const total = signups.timestamps.length;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <PanelHeading title="Student Growth" />
        <RangeTabs active={range} />
      </div>
      <p className="mt-1 text-xs text-slate">
        {total === 0
          ? "No new students registered in this period."
          : `${total} new ${total === 1 ? "student" : "students"} registered in this period.`}
      </p>
      <div className="mt-4">
        <LineChart
          points={points}
          ariaLabel={`New student registrations, ${range === "year" ? "by month" : "by day"}`}
          height={230}
        />
      </div>
    </Card>
  );
}
