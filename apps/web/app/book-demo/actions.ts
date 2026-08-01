"use server";

import { z } from "zod";
import { DateTime } from "luxon";
import { createDemoBooking } from "../../repositories/demoBookingRepository";
import { slotsForDate } from "../../lib/demoSlots";

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const BookDemoSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  academyName: z.string().trim().max(200).optional(),
  studentCount: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(2000).optional(),
  // ISO instant of the chosen slot, as produced by the picker.
  slotIso: z.string().datetime({ message: "Pick a time slot" }),
  timezone: z.string().trim().min(1, "Pick a timezone"),
});

export async function bookDemoAction(formData: FormData): Promise<ActionResult> {
  const parsed = BookDemoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form" };
  }
  const { name, email, academyName, studentCount, notes, slotIso, timezone } = parsed.data;

  const slot = DateTime.fromISO(slotIso, { zone: "utc" });
  if (!slot.isValid) {
    return { ok: false, error: "That time slot isn't valid. Please pick another." };
  }

  // Never trust the submitted instant: recompute the real availability for that
  // day in the visitor's zone and require an exact match. Same principle as
  // re-validating moves server-side — the client's value is a request, not a fact.
  const isoDateInViewerZone = slot.setZone(timezone).toISODate();
  if (!isoDateInViewerZone) {
    return { ok: false, error: "That timezone isn't valid. Please pick another." };
  }

  const allowedSlots = slotsForDate(isoDateInViewerZone, timezone);
  const isAllowed = allowedSlots.some((s) => s.getTime() === slot.toMillis());
  if (!isAllowed) {
    return {
      ok: false,
      error: "That slot is no longer available. Please pick another time.",
    };
  }

  await createDemoBooking({
    name,
    email,
    academyName: academyName || null,
    studentCount: studentCount || null,
    notes: notes || null,
    slotAtUtc: slot.toJSDate(),
    timezone,
  });

  return { ok: true, data: undefined };
}
