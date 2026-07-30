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
