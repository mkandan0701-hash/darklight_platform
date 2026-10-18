import { z } from "zod";
import { CALENDAR_VIEWS, type CalendarView } from "./range";
import { CALENDAR_CATEGORIES, type CalendarCategory, type ClientFilters } from "./events";

// The calendar's state lives in the URL, so a coach can bookmark "Priya's
// week" and Back works. Two kinds of parameter:
//   server — view, date, tz, coach, student, child: change what is fetched
//            (and what the viewer is authorized to see), so they navigate.
//   client — types, status, q, format: narrow what's already loaded, so they
//            update in place without a round trip.
// Everything is parsed leniently: a bad value falls back to its default
// rather than erroring, because these arrive from hand-edited links.

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export type ServerParams = {
  view: CalendarView;
  date?: string;
  tz?: string;
  coach?: string;
  student?: string;
  child?: string;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string | undefined {
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

function optional<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseServerParams(raw: RawParams): ServerParams {
  return {
    view: optional(z.enum(CALENDAR_VIEWS), one(raw, "view")) ?? "month",
    date: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), one(raw, "date")),
    tz: optional(z.string().max(64), one(raw, "tz")),
    coach: optional(id, one(raw, "coach")),
    student: optional(id, one(raw, "student")),
    child: optional(id, one(raw, "child")),
  };
}

export function parseClientFilters(get: (key: string) => string | null): ClientFilters {
  const categories = (get("types") ?? "")
    .split(",")
    .filter((t): t is CalendarCategory => (CALENDAR_CATEGORIES as readonly string[]).includes(t));
  const status = optional(z.enum(["ALL", "UPCOMING", "COMPLETED", "CANCELLED"]), get("status") ?? undefined);
  const format = optional(z.enum(["ALL", "GROUP", "INDIVIDUAL"]), get("format") ?? undefined);
  return {
    categories,
    status: status ?? "ALL",
    q: (get("q") ?? "").slice(0, 100),
    format: format ?? "ALL",
  };
}
