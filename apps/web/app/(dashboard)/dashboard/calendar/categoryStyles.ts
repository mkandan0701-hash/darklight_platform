import type { CalendarCategory } from "../../../../lib/calendar/events";

// One colour family per category, so a chip, its filter pill and its legend
// dot can never disagree. The reference's four (blue class, yellow homework,
// purple tournament, green simul) come first; the three non-teaching entries
// are deliberately muted so they read as context, not as things to attend.

export type CategoryStyle = {
  label: string;
  /** Event chip on the calendar. */
  chip: string;
  /** Left accent on time-grid blocks and agenda rows. */
  accent: string;
  dot: string;
  /** Filter pill, on and off. */
  pillOn: string;
  pillOff: string;
};

export const CATEGORY_STYLES: Record<CalendarCategory, CategoryStyle> = {
  CLASS: {
    label: "Class",
    chip: "border-blue-200 bg-blue-50 text-blue-900",
    accent: "border-l-blue-500",
    dot: "bg-blue-500",
    pillOn: "bg-blue-100 text-blue-900 ring-1 ring-blue-300",
    pillOff: "bg-blue-50 text-blue-900",
  },
  HOMEWORK: {
    label: "Homework",
    chip: "border-amber-200 bg-amber-50 text-amber-900",
    accent: "border-l-amber-400",
    dot: "bg-amber-400",
    pillOn: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
    pillOff: "bg-amber-50 text-amber-900",
  },
  TOURNAMENT: {
    label: "Tournament",
    chip: "border-violet-200 bg-violet-50 text-violet-900",
    accent: "border-l-violet-500",
    dot: "bg-violet-500",
    pillOn: "bg-violet-100 text-violet-900 ring-1 ring-violet-300",
    pillOff: "bg-violet-50 text-violet-900",
  },
  SIMUL: {
    label: "Simul",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-900",
    accent: "border-l-emerald-500",
    dot: "bg-emerald-500",
    pillOn: "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300",
    pillOff: "bg-emerald-50 text-emerald-900",
  },
  HOLIDAY: {
    label: "Holiday",
    chip: "border-rose-200 bg-rose-50 text-rose-900",
    accent: "border-l-rose-400",
    dot: "bg-rose-400",
    pillOn: "",
    pillOff: "",
  },
  UNAVAILABLE: {
    label: "Unavailable",
    chip: "border-slate/20 bg-slate-light/60 text-slate",
    accent: "border-l-slate",
    dot: "bg-slate",
    pillOn: "",
    pillOff: "",
  },
  OTHER: {
    label: "Event",
    chip: "border-ink/15 bg-parchment text-ink",
    accent: "border-l-ink/40",
    dot: "bg-ink/40",
    pillOn: "",
    pillOff: "",
  },
};

/** The four filterable categories, in the reference's order. */
export const FILTER_CATEGORIES = ["CLASS", "HOMEWORK", "TOURNAMENT", "SIMUL"] as const;

export const STATUS_LABELS = {
  UPCOMING: "Upcoming",
  LIVE: "Live now",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

/** Zones offered in pickers — the academy's usual diaspora pairings first. */
export const COMMON_ZONES = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Dublin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

export function zoneOptions(...extra: (string | null | undefined)[]): string[] {
  return [...new Set([...extra.filter((z): z is string => !!z), ...COMMON_ZONES])];
}
