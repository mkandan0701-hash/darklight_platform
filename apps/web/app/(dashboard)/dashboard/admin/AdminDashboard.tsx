import { Suspense } from "react";
import { getTenantById } from "../../../../repositories/tenantRepository";
import type { CurrentSession } from "../../../../lib/auth/session";
import { pageHeadingClass } from "../../../../components/ui/styles";
import { PanelSkeleton, StatCardSkeleton } from "../../../../components/ui/Skeleton";
import { AdminStatCards } from "./AdminStatCards";
import { EngagementCard } from "./EngagementCard";
import { StudentGrowthCard, parseGrowthRange } from "./StudentGrowthCard";
import { RecentActivityPanel, TodaysClassrooms, UpcomingSessionsPanel } from "./SideWidgets";

/**
 * The academy admin's landing page.
 *
 * Every panel fetches its own data behind its own Suspense boundary, so the
 * shell and headings paint immediately instead of waiting on the slowest
 * query — the first streaming on any page in this app.
 *
 * `now` is resolved once here and passed down rather than each panel calling
 * new Date(). Two reasons: panels would otherwise disagree about where a week
 * ends if one rendered either side of midnight, and getSessionsToday is
 * memoized on its arguments, so a shared instant is what lets the stat row and
 * the Today panel share one query instead of issuing two.
 */
export async function AdminDashboard({
  session,
  growth,
}: {
  session: CurrentSession;
  growth: string | undefined;
}) {
  const now = new Date();
  const range = parseGrowthRange(growth);

  // Periods are bucketed in the academy's zone so every admin sees the same
  // week; CurrentSession carries only the viewer's own, which is still what
  // clock times render in.
  const tenant = await getTenantById(session.tenantId);
  const academyZone = tenant?.timezone ?? session.timezone;

  const statsSkeleton = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );

  return (
    <div>
      <h1 className={pageHeadingClass}>Admin Dashboard</h1>
      <p className="mt-1 text-sm text-slate">Overview of your academy&rsquo;s performance</p>

      <div className="mt-5">
        <Suspense fallback={statsSkeleton}>
          <AdminStatCards tenantId={session.tenantId} zone={academyZone} now={now} />
        </Suspense>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Suspense fallback={<PanelSkeleton height={230} />}>
            <StudentGrowthCard
              tenantId={session.tenantId}
              zone={academyZone}
              range={range}
              now={now}
            />
          </Suspense>
          <Suspense fallback={<PanelSkeleton height={260} />}>
            <EngagementCard tenantId={session.tenantId} zone={academyZone} now={now} />
          </Suspense>
        </div>

        <div className="space-y-4">
          <Suspense fallback={<PanelSkeleton rows={2} />}>
            <TodaysClassrooms
              tenantId={session.tenantId}
              academyZone={academyZone}
              viewerZone={session.timezone}
              now={now}
            />
          </Suspense>
          <Suspense fallback={<PanelSkeleton rows={2} />}>
            <UpcomingSessionsPanel
              tenantId={session.tenantId}
              viewerZone={session.timezone}
              now={now}
            />
          </Suspense>
          <Suspense fallback={<PanelSkeleton rows={4} />}>
            <RecentActivityPanel tenantId={session.tenantId} now={now} />
          </Suspense>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate">
        Counts are bucketed in the academy&rsquo;s timezone ({academyZone}); times are shown in
        yours ({session.timezone}).
      </p>
    </div>
  );
}
