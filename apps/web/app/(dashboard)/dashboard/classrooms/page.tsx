import Link from "next/link";
import { getCurrentSession } from "../../../../lib/auth/session";
import {
  listClassroomSeriesForViewer,
  listClassroomsForViewer,
  listCoachesForViewer,
} from "../../../../repositories/classroomRepository";
import { listBoardSessionsForViewer } from "../../../../repositories/liveSessionRepository";
import { SESSION_BUCKETS, type SessionBucket } from "../../../../lib/liveSession";
import { displayName } from "../../../../lib/displayName";
import { formatInZone } from "../../../../lib/time";
import { meetingButtonLabel } from "../../../../lib/meetingLink";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Badge } from "../../../../components/ui/Badge";
import { fieldInputClass } from "../../../../components/ui/Field";
import {
  ICON_PROPS,
  Layers,
  List,
  Search,
  SlidersHorizontal,
} from "../../../../components/ui/icons";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";
import { CreateClassroomButton } from "./CreateClassroomButton";
import { SessionCard } from "./SessionCard";

type Bucket = (typeof SESSION_BUCKETS)[number];
type View = "sessions" | "series";

const TAB_LABELS: Record<Bucket, string> = {
  CURRENT: "Current",
  UPCOMING: "Upcoming",
  DELAYED: "Delayed",
  COMPLETED: "Completed",
};

const TAB_EMPTY: Record<Bucket, { title: string; description: string }> = {
  CURRENT: {
    title: "Nothing on right now",
    description: "Classes show up here from 15 minutes before they start until they finish.",
  },
  UPCOMING: {
    title: "No upcoming classes",
    description: "Add a weekly slot on a classroom's page and its classes appear here automatically.",
  },
  DELAYED: {
    title: "No delayed classes",
    description:
      "A class lands here when its time has passed and nobody started it or marked attendance.",
  },
  COMPLETED: {
    title: "No completed classes yet",
    description: "Classes move here once they've been taught.",
  },
};

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type SearchParams = { [key: string]: string | string[] | undefined };

function param(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim().slice(0, 100) : undefined;
}

function parseBucket(raw: string | undefined): Bucket {
  const upper = raw?.toUpperCase();
  return (SESSION_BUCKETS as readonly string[]).includes(upper ?? "")
    ? (upper as Bucket)
    : "UPCOMING";
}

export default async function ClassroomsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentSession();
  const now = new Date();

  const view: View = param(searchParams, "view") === "series" ? "series" : "sessions";
  const bucket = parseBucket(param(searchParams, "tab"));
  const q = param(searchParams, "q");
  const classroomId = param(searchParams, "classroom");
  // The coach filter is an admin's tool — a coach is already looking at their
  // own rooms, and a student or parent has no reason to slice by staff.
  const coachProfileId =
    session.role === "ACADEMY_ADMIN" ? param(searchParams, "coach") : undefined;

  const hrefWith = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      view: view === "series" ? "series" : undefined,
      tab: bucket.toLowerCase(),
      q,
      classroom: classroomId,
      coach: coachProfileId,
      ...changes,
    };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const qs = next.toString();
    return qs ? `/dashboard/classrooms?${qs}` : "/dashboard/classrooms";
  };

  const [filterClassrooms, filterCoaches] = await Promise.all([
    listClassroomsForViewer(session),
    session.role === "ACADEMY_ADMIN" ? listCoachesForViewer(session) : Promise.resolve([]),
  ]);
  const activeFilterCount = [classroomId, coachProfileId].filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={pageHeadingClass}>Classroom Management</h1>
          <p className="mt-1 text-sm text-slate">
            Every class across your classrooms, in your time zone ({session.timezone}).
          </p>
        </div>
        {session.role === "ACADEMY_ADMIN" && <CreateClassroomButton />}
      </div>

      <Card className="mt-6 flex flex-wrap items-center gap-3 p-3">
        {view === "sessions" ? (
          <nav aria-label="Session status" className="flex flex-wrap gap-1 rounded-lg bg-parchment p-1">
            {SESSION_BUCKETS.map((tab) => (
              <Link
                key={tab}
                href={hrefWith({ tab: tab.toLowerCase() })}
                aria-current={tab === bucket ? "page" : undefined}
                className={`rounded-md px-4 py-1.5 text-sm ${
                  tab === bucket ? "bg-white font-semibold text-ink shadow-sm" : "text-slate hover:text-ink"
                }`}
              >
                {TAB_LABELS[tab]}
              </Link>
            ))}
          </nav>
        ) : (
          <p className="px-2 text-sm font-semibold text-ink">All classrooms</p>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <nav aria-label="View" className="flex gap-1 rounded-lg border border-ink/10 p-1">
            <Link
              href={hrefWith({ view: undefined })}
              aria-current={view === "sessions" ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${
                view === "sessions" ? "bg-parchment font-semibold text-ink" : "text-slate hover:text-ink"
              }`}
            >
              <List {...ICON_PROPS} size={14} aria-hidden="true" /> Session
            </Link>
            <Link
              href={hrefWith({ view: "series" })}
              aria-current={view === "series" ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${
                view === "series" ? "bg-parchment font-semibold text-ink" : "text-slate hover:text-ink"
              }`}
            >
              <Layers {...ICON_PROPS} size={14} aria-hidden="true" /> Class Series
            </Link>
          </nav>

          {/* Plain GET forms: search and filters live in the URL, so the page
              stays a server component and a filtered view can be bookmarked. */}
          <form action="/dashboard/classrooms" className="relative">
            {view === "series" && <input type="hidden" name="view" value="series" />}
            <input type="hidden" name="tab" value={bucket.toLowerCase()} />
            {classroomId && <input type="hidden" name="classroom" value={classroomId} />}
            {coachProfileId && <input type="hidden" name="coach" value={coachProfileId} />}
            <Search
              {...ICON_PROPS}
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={view === "series" ? "Search classrooms" : "Search classrooms or students"}
              aria-label="Search"
              className={`${fieldInputClass} w-60 pl-9`}
            />
          </form>

          {view === "sessions" && (
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate hover:text-ink">
                <SlidersHorizontal {...ICON_PROPS} size={15} aria-hidden="true" />
                Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </summary>
              <form
                action="/dashboard/classrooms"
                className="absolute right-0 z-10 mt-2 flex w-64 flex-col gap-3 rounded-xl border border-ink/10 bg-white p-4 shadow-lg"
              >
                <input type="hidden" name="tab" value={bucket.toLowerCase()} />
                {q && <input type="hidden" name="q" value={q} />}
                <label className="flex flex-col gap-1 text-xs font-medium text-ink">
                  Classroom
                  <select name="classroom" defaultValue={classroomId ?? ""} className={fieldInputClass}>
                    <option value="">All classrooms</option>
                    {filterClassrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                {session.role === "ACADEMY_ADMIN" && (
                  <label className="flex flex-col gap-1 text-xs font-medium text-ink">
                    Coach
                    <select name="coach" defaultValue={coachProfileId ?? ""} className={fieldInputClass}>
                      <option value="">All coaches</option>
                      {filterCoaches.map((c) => (
                        <option key={c.id} value={c.id}>
                          {displayName(c.user)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex items-center justify-between">
                  <Link href={hrefWith({ classroom: undefined, coach: undefined })} className="text-xs text-slate hover:text-ink">
                    Clear
                  </Link>
                  <button
                    type="submit"
                    className="rounded-lg bg-board px-3 py-1.5 text-sm font-medium text-white hover:bg-board-dark"
                  >
                    Apply
                  </button>
                </div>
              </form>
            </details>
          )}
        </div>
      </Card>

      {view === "sessions" ? (
        <SessionsView
          viewer={session}
          bucket={bucket}
          filters={{ q, classroomId, coachProfileId }}
          now={now}
          noClassrooms={filterClassrooms.length === 0}
        />
      ) : (
        <SeriesView viewer={session} q={q} />
      )}
    </div>
  );
}

async function SessionsView({
  viewer,
  bucket,
  filters,
  now,
  noClassrooms,
}: {
  viewer: Awaited<ReturnType<typeof getCurrentSession>>;
  bucket: Bucket;
  filters: { q?: string; classroomId?: string; coachProfileId?: string };
  now: Date;
  noClassrooms: boolean;
}) {
  if (noClassrooms) {
    return (
      <div className="mt-6">
        <NoClassroomsState role={viewer.role} />
      </div>
    );
  }

  const sessions = await listBoardSessionsForViewer(viewer, { bucket, ...filters }, now);

  if (sessions.length === 0) {
    const filtered = Boolean(filters.q || filters.classroomId || filters.coachProfileId);
    return (
      <div className="mt-6">
        <EmptyState
          title={filtered ? "No classes match" : TAB_EMPTY[bucket].title}
          description={
            filtered ? "Try a different search, or clear the filters." : TAB_EMPTY[bucket].description
          }
        />
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {sessions.map((liveSession) => (
        <SessionCard
          key={liveSession.id}
          liveSession={liveSession}
          bucket={bucket as Exclude<SessionBucket, "CANCELLED">}
          viewer={viewer}
          now={now}
        />
      ))}
    </ul>
  );
}

async function SeriesView({
  viewer,
  q,
}: {
  viewer: Awaited<ReturnType<typeof getCurrentSession>>;
  q?: string;
}) {
  const classrooms = await listClassroomSeriesForViewer(viewer, q);

  if (classrooms.length === 0) {
    return (
      <div className="mt-6">
        {q ? (
          <EmptyState title="No classrooms match" description="Try a different search." />
        ) : (
          <NoClassroomsState role={viewer.role} />
        )}
      </div>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {classrooms.map((classroom) => {
        const next = classroom.liveSessions[0];
        return (
          <Card key={classroom.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <Link
                href={`/dashboard/classrooms/${classroom.id}`}
                className={`${textLinkClass} font-display text-lg`}
              >
                {classroom.name}
              </Link>
              <p className="mt-1 text-xs text-slate">
                {classroom.coaches.length > 0
                  ? `Coach: ${classroom.coaches.map((c) => displayName(c.coach.user)).join(", ")}`
                  : "No coach assigned"}
                {" · "}
                {classroom.students.length}{" "}
                {classroom.students.length === 1 ? "student" : "students"}
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                {classroom.scheduleSlots.length === 0 ? (
                  <span className="text-xs text-slate">No weekly schedule</span>
                ) : (
                  classroom.scheduleSlots.map((slot) => (
                    // In the slot's own zone: this is the rule ("Saturdays 10:00
                    // IST"), not an instant. The next-class line converts.
                    <Badge key={slot.id}>
                      {DAY_LABELS[slot.dayOfWeek]} {slot.localTime} · {slot.timezone}
                    </Badge>
                  ))
                )}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="text-xs uppercase tracking-wide text-slate">Next class</p>
              <p className="text-ink">
                {next ? formatInZone(next.scheduledAtUtc, viewer.timezone) : "None scheduled"}
              </p>
              {classroom.meetingUrl && (
                <p className="mt-1 text-xs text-board">{meetingButtonLabel(classroom.meetingUrl)} link set</p>
              )}
            </div>
          </Card>
        );
      })}
    </ul>
  );
}

function NoClassroomsState({ role }: { role: Awaited<ReturnType<typeof getCurrentSession>>["role"] }) {
  return (
    <EmptyState
      title="No classrooms yet"
      description={
        {
          ACADEMY_ADMIN: "Create your first classroom to start enrolling coaches and students.",
          COACH: "Your academy admin hasn't assigned you to a classroom yet.",
          STUDENT: "You're not enrolled in a classroom yet — your academy admin can add you.",
          PARENT: "None of your children are enrolled in a classroom yet.",
        }[role]
      }
    />
  );
}
