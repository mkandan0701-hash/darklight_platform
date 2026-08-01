import { DateTime } from "luxon";

// Demo availability, expressed in the *host's* zone so the window doesn't
// drift when a visitor in another zone views it. Slots are then rendered in
// the visitor's chosen zone, per the timezone rules in claude.md.
export const HOST_TIMEZONE = "Asia/Kolkata";
export const SLOT_DURATION_MINS = 30;
const FIRST_SLOT_HOUR = 9; // 09:00 host time
const LAST_SLOT_HOUR = 18; // last slot starts before 18:00 host time
const SLOT_STEP_MINS = 30;

// Weekdays only (Luxon: 1 = Monday … 7 = Sunday).
function isBookableDay(day: DateTime): boolean {
  return day.weekday <= 5;
}

/**
 * Every bookable slot for `isoDate` (a yyyy-MM-dd string interpreted in
 * `viewerZone`), returned as UTC instants. Slots already in the past are
 * omitted so a visitor can't book a time that has been and gone.
 */
export function slotsForDate(
  isoDate: string,
  viewerZone: string,
  now: DateTime = DateTime.utc()
): Date[] {
  const dayInViewerZone = DateTime.fromISO(isoDate, { zone: viewerZone });
  if (!dayInViewerZone.isValid) return [];

  const slots: Date[] = [];
  // Walk the host's working window for the two host-days that can overlap this
  // viewer-day, then keep only the instants that land on the viewer's date.
  for (const offset of [-1, 0, 1]) {
    const hostDay = dayInViewerZone.setZone(HOST_TIMEZONE).plus({ days: offset }).startOf("day");
    if (!isBookableDay(hostDay)) continue;

    for (
      let minutes = FIRST_SLOT_HOUR * 60;
      minutes < LAST_SLOT_HOUR * 60;
      minutes += SLOT_STEP_MINS
    ) {
      const slot = hostDay.plus({ minutes });
      if (slot <= now) continue;
      if (slot.setZone(viewerZone).toISODate() !== dayInViewerZone.toISODate()) continue;
      slots.push(slot.toUTC().toJSDate());
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}

/** True when `isoDate` (in `viewerZone`) has at least one bookable slot left. */
export function hasAvailability(
  isoDate: string,
  viewerZone: string,
  now: DateTime = DateTime.utc()
): boolean {
  return slotsForDate(isoDate, viewerZone, now).length > 0;
}

/** Formats a UTC slot instant for display in the viewer's zone, e.g. "9:30 AM". */
export function formatSlotTime(slotUtc: Date, viewerZone: string): string {
  return DateTime.fromJSDate(slotUtc, { zone: "utc" })
    .setZone(viewerZone)
    .toFormat("h:mm a");
}

/** Long-form confirmation label, e.g. "Fri, 31 Jul 2026 at 9:30 AM IST". */
export function formatSlotLong(slotUtc: Date, viewerZone: string): string {
  return DateTime.fromJSDate(slotUtc, { zone: "utc" })
    .setZone(viewerZone)
    .toFormat("cccc, dd LLL yyyy 'at' h:mm a ZZZZ");
}
