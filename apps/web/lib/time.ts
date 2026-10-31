import { DateTime } from "luxon";

// Converts a `<input type="datetime-local">` value (no timezone info) —
// interpreted in `zone` — into a UTC Date suitable for storage. This is the
// one conversion point: everything downstream (DB, sockets) stays in UTC.
export function zonedLocalToUtc(localDateTime: string, zone: string): Date {
  const dt = DateTime.fromISO(localDateTime, { zone });
  if (!dt.isValid) {
    throw new Error(`Invalid date/time or timezone: ${dt.invalidReason}`);
  }
  return dt.toUTC().toJSDate();
}

// Formats a UTC Date for display in the *viewer's* timezone — never the
// sender's — per the time-zone-first-class rule in claude.md.
export function formatInZone(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone: "utc" })
    .setZone(zone)
    .toFormat("ccc, dd LLL yyyy 'at' HH:mm ZZZZ");
}

// Clock time only, in the *viewer's* zone. For live-session chat, where the
// date is implicit (it's happening now) but the zone is not — a coach in IST
// and a student in EST must each read their own wall clock.
export function formatTimeInZone(iso: string, zone: string): string {
  const dt = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
  return dt.isValid ? dt.toFormat("HH:mm") : "";
}

// Default value for a `datetime-local` input: the next Saturday at 10:00 in
// `zone`, supporting the weekend-first classroom scheduling default.
export function nextWeekendLocalDefault(zone: string): string {
  const now = DateTime.now().setZone(zone);
  let candidate = now.set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
  const daysUntilSaturday = (6 - candidate.weekday + 7) % 7;
  candidate = candidate.plus({ days: daysUntilSaturday });
  if (candidate < now) {
    candidate = candidate.plus({ days: 7 });
  }
  return candidate.toFormat("yyyy-LL-dd'T'HH:mm");
}

/**
 * The calendar-tile pieces of a session card — day, month, weekday, clock —
 * all read in the *viewer's* zone. Done as one conversion so the day number
 * and the time can never disagree near midnight (a 4:00 AM IST class is the
 * previous evening in New Jersey, and both halves of the tile must say so).
 */
export function dateBlockInZone(
  date: Date,
  zone: string
): { day: string; month: string; weekday: string; time: string; zoneAbbr: string } {
  const dt = DateTime.fromJSDate(date, { zone: "utc" }).setZone(zone);
  return {
    day: dt.toFormat("d"),
    month: dt.toFormat("LLL").toUpperCase(),
    weekday: dt.toFormat("ccc"),
    time: dt.toFormat("h:mm a"),
    zoneAbbr: dt.toFormat("ZZZZ"),
  };
}
