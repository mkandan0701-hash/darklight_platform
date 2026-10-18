import { DateTime } from "luxon";

// The one shape every calendar view renders. Built server-side from the rows
// that already own each kind of event (LiveSession, Assignment, Tournament,
// Simul, CalendarBlock) — see repositories/calendarRepository.ts — and sent to
// the client already filtered to what the viewer may see. Nothing in here is
// authorization: by the time an event exists in this shape, the viewer is
// allowed to know about it.

export const CALENDAR_CATEGORIES = [
  "CLASS",
  "HOMEWORK",
  "TOURNAMENT",
  "SIMUL",
  "HOLIDAY",
  "UNAVAILABLE",
  "OTHER",
] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

export const CALENDAR_STATUSES = ["UPCOMING", "LIVE", "COMPLETED", "CANCELLED"] as const;
export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export type SeriesRef = { kind: "SLOT" | "SERIES"; id: string };

export interface CalendarEvent {
  /** Unique across categories: `${category}:${sourceId}`. */
  id: string;
  sourceId: string;
  category: CalendarCategory;
  title: string;
  /** Second line — classroom for homework, format for a tournament. */
  subtitle?: string;
  description?: string | null;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
  status: CalendarStatus;
  /** A class whose time was moved after it was first scheduled. */
  rescheduled: boolean;
  /** Where to go for the full record (class room, homework, tournament). */
  href?: string;
  meetingUrl?: string | null;
  coachNames: string[];
  /**
   * Who's in it. `names` is present for staff only: a student sees that a
   * group class has 6 people, not who they are.
   */
  participants?: { count: number; names?: string[] };
  format?: "GROUP" | "INDIVIDUAL";
  classroomId?: string;
  /** The zone it was scheduled in, if known. Display always uses the viewer's. */
  timezone?: string | null;
  durationMins?: number;
  series?: SeriesRef | null;
  /** Server-computed: may this viewer edit/reschedule/cancel it? */
  canEdit: boolean;
  /** Optimistic-concurrency token for class edits. */
  version?: string;
  attendance?: { marked: number; present?: boolean | null };
  /** For blocks: which coach's time (UNAVAILABLE), and staff-only flag. */
  coachProfileId?: string | null;
  staffOnly?: boolean;
}

// How long to draw things that have a start but no stored end. Display only —
// nothing about scheduling or conflicts reads these.
export const TOURNAMENT_DISPLAY_MINS = 180;
export const SIMUL_DISPLAY_MINS = 120;
export const HOMEWORK_DISPLAY_MINS = 30;

/** Clock-derived status for anything that isn't a class (classes use lib/liveSession). */
export function clockStatus(startUtc: Date, endUtc: Date, now: Date = new Date()): CalendarStatus {
  const t = now.getTime();
  if (t < startUtc.getTime()) return "UPCOMING";
  if (t < endUtc.getTime()) return "LIVE";
  return "COMPLETED";
}

export type ClientFilters = {
  categories: CalendarCategory[]; // empty = all
  status: "ALL" | "UPCOMING" | "COMPLETED" | "CANCELLED";
  q: string;
  format: "ALL" | "GROUP" | "INDIVIDUAL";
};

export const DEFAULT_CLIENT_FILTERS: ClientFilters = {
  categories: [],
  status: "ALL",
  q: "",
  format: "ALL",
};

/**
 * The filters that narrow what's already loaded and authorized, so they can
 * run in the browser without a round trip. Coach/student/child selection is
 * NOT here — those change what the server is willing to return.
 *
 * Holidays and blocked time sit outside the category chips (they aren't in the
 * reference's four), so they stay visible unless the status filter excludes
 * them; a coach filtering to Homework still needs to see the academy is shut.
 */
export function filterEvents(events: CalendarEvent[], f: ClientFilters): CalendarEvent[] {
  const q = f.q.trim().toLowerCase();
  return events.filter((e) => {
    const isBlock = e.category === "HOLIDAY" || e.category === "UNAVAILABLE" || e.category === "OTHER";
    if (f.categories.length > 0 && !isBlock && !f.categories.includes(e.category)) return false;
    if (f.status === "UPCOMING" && !(e.status === "UPCOMING" || e.status === "LIVE")) return false;
    if (f.status === "COMPLETED" && e.status !== "COMPLETED") return false;
    if (f.status === "CANCELLED" && e.status !== "CANCELLED") return false;
    if (f.format !== "ALL" && e.category === "CLASS" && e.format !== f.format) return false;
    if (f.format !== "ALL" && e.category !== "CLASS" && !isBlock) return false;
    if (q) {
      const haystack = [e.title, e.subtitle ?? "", ...e.coachNames, ...(e.participants?.names ?? [])]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

const dayKey = (d: DateTime) => d.toFormat("yyyy-LL-dd");

/**
 * Events per local day in `zone`. An event appears on every day it overlaps,
 * so a two-day holiday shows on both and a class running past midnight shows
 * on the day it starts and the next. Sorted all-day first, then by start.
 */
export function eventsByDay(
  events: CalendarEvent[],
  days: DateTime[],
  zone: string
): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>(days.map((d) => [dayKey(d), []]));
  for (const e of events) {
    // A deadline belongs to the day it falls due, not the day its drawn
    // half-hour block happens to start on.
    const startIso = e.category === "HOMEWORK" ? e.endUtc : e.startUtc;
    const start = DateTime.fromISO(startIso, { zone: "utc" }).setZone(zone);
    // An end equal to the next midnight belongs to the previous day.
    const endRaw = DateTime.fromISO(e.endUtc, { zone: "utc" }).setZone(zone);
    const end = endRaw > start ? endRaw.minus({ milliseconds: 1 }) : start;
    for (let d = start.startOf("day"); d <= end; d = d.plus({ days: 1 })) {
      map.get(dayKey(d))?.push(e);
    }
  }
  for (const list of map.values()) list.sort(compareEvents);
  return map;
}

export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.startUtc.localeCompare(b.startUtc) || a.title.localeCompare(b.title);
}

export type PositionedEvent = {
  event: CalendarEvent;
  /** Minutes from the day's local midnight, clamped to the day. */
  top: number;
  height: number;
  column: number;
  columns: number;
};

/**
 * Lays out one day's timed events for the week/day grid: each event gets a
 * vertical span in minutes and a column, so overlapping events sit side by
 * side instead of on top of each other. Classic cluster-then-pack: events
 * that transitively overlap form a cluster sharing one column count.
 */
export function layoutDay(events: CalendarEvent[], day: DateTime, minHeight = 20): PositionedEvent[] {
  const dayStart = day.startOf("day");
  const nextDay = dayStart.plus({ days: 1 });
  // Wall-clock minutes, not elapsed ones: the grid's hour labels are wall
  // clock, and on a DST-change day elapsed minutes would drift an event an
  // hour away from its label for the rest of the day.
  const wall = (d: DateTime) => d.hour * 60 + d.minute;
  const items = events
    .filter((e) => !e.allDay)
    .map((event) => {
      const s = DateTime.fromISO(event.startUtc, { zone: "utc" }).setZone(day.zone);
      const en = DateTime.fromISO(event.endUtc, { zone: "utc" }).setZone(day.zone);
      const top = s < dayStart ? 0 : wall(s);
      const bottom = en >= nextDay ? 24 * 60 : Math.max(top, wall(en));
      return { event, top, bottom: Math.min(24 * 60, Math.max(bottom, top + minHeight)) };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  const out: PositionedEvent[] = [];
  let cluster: { item: (typeof items)[number]; column: number }[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];

  const flush = () => {
    const columns = Math.max(1, columnEnds.length);
    for (const { item, column } of cluster) {
      out.push({ event: item.event, top: item.top, height: item.bottom - item.top, column, columns });
    }
    cluster = [];
    columnEnds = [];
  };

  for (const item of items) {
    if (item.top >= clusterEnd && cluster.length > 0) flush();
    let column = columnEnds.findIndex((end) => end <= item.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.bottom);
    } else {
      columnEnds[column] = item.bottom;
    }
    cluster.push({ item, column });
    clusterEnd = Math.max(clusterEnd, item.bottom);
  }
  if (cluster.length > 0) flush();
  return out;
}
