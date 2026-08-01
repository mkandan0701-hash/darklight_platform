"use client";

import { useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { bookDemoAction } from "../../app/book-demo/actions";
import { Button } from "../ui/Button";
import { Field, fieldInputClass } from "../ui/Field";
import {
  SLOT_DURATION_MINS,
  formatSlotLong,
  formatSlotTime,
  hasAvailability,
  slotsForDate,
} from "../../lib/demoSlots";

const COMMON_ZONES = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Dublin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

export function BookDemoScheduler() {
  const [zone, setZone] = useState(detectZone);
  const [monthCursor, setMonthCursor] = useState(() => DateTime.now().startOf("month"));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  const zoneOptions = useMemo(() => {
    const detected = detectZone();
    return Array.from(new Set([detected, ...COMMON_ZONES]));
  }, []);

  const todayIso = DateTime.now().setZone(zone).toISODate();

  // Leading blanks so the 1st lands under its real weekday column.
  const calendarCells = useMemo(() => {
    const start = monthCursor.startOf("month");
    const daysInMonth = monthCursor.daysInMonth ?? 30;
    const leadingBlanks = start.weekday % 7; // Luxon Mon=1..Sun=7 → Sun=0
    const cells: (string | null)[] = Array.from({ length: leadingBlanks }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(start.set({ day }).toISODate());
    }
    return cells;
  }, [monthCursor]);

  const slots = useMemo(
    () => (selectedDate ? slotsForDate(selectedDate, zone) : []),
    [selectedDate, zone]
  );

  function handleSelectZone(nextZone: string) {
    setZone(nextZone);
    setSelectedSlot(null);
  }

  function handleSubmit(formData: FormData) {
    if (!selectedSlot) return;
    setError(null);
    formData.set("slotIso", selectedSlot.toISOString());
    formData.set("timezone", zone);

    startTransition(async () => {
      const result = await bookDemoAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmed(selectedSlot);
    });
  }

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-board/30 bg-board-light/40 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-board text-xl text-white">
          ✓
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
          You&apos;re in. See you then!
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
          {formatSlotLong(confirmed, zone)}
        </p>
        <p className="mt-4 text-sm text-slate">
          We&apos;ve got your request — we&apos;ll email you to confirm the details.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate">🌐</span>
          <span className="sr-only">Timezone</span>
          <select
            value={zone}
            onChange={(e) => handleSelectZone(e.target.value)}
            className={`${fieldInputClass} !py-1.5`}
          >
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-xs text-slate">{SLOT_DURATION_MINS} min</span>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonthCursor((m) => m.minus({ months: 1 }))}
              aria-label="Previous month"
              className="rounded-lg px-3 py-1.5 text-lg text-slate hover:bg-parchment hover:text-ink"
            >
              ‹
            </button>
            <p className="font-display text-base font-bold tracking-tight text-ink">
              {monthCursor.toFormat("LLLL yyyy")}
            </p>
            <button
              type="button"
              onClick={() => setMonthCursor((m) => m.plus({ months: 1 }))}
              aria-label="Next month"
              className="rounded-lg px-3 py-1.5 text-lg text-slate hover:bg-parchment hover:text-ink"
            >
              ›
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-2 text-[11px] font-semibold tracking-wide text-slate">
                {label}
              </div>
            ))}
            {calendarCells.map((iso, i) => {
              if (!iso) return <div key={`blank-${i}`} />;
              const isPast = todayIso !== null && iso < todayIso;
              const available = !isPast && hasAvailability(iso, zone);
              const isSelected = iso === selectedDate;
              const dayNum = DateTime.fromISO(iso).day;

              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!available}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedDate(iso);
                    setSelectedSlot(null);
                  }}
                  className={`aspect-square rounded-lg text-sm transition-colors motion-reduce:transition-none ${
                    isSelected
                      ? "bg-board font-semibold text-white"
                      : available
                      ? "font-medium text-ink hover:bg-board-light"
                      : "cursor-not-allowed text-slate/40"
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:border-l lg:border-ink/10 lg:pl-6">
          {!selectedDate ? (
            <p className="py-8 text-center text-sm text-slate">
              Pick a date to see available times.
            </p>
          ) : (
            <>
              <p className="font-display text-sm font-bold tracking-tight text-ink">
                {DateTime.fromISO(selectedDate).toFormat("cccc d LLL")}
              </p>
              {slots.length === 0 ? (
                <p className="mt-4 text-sm text-slate">
                  No times left on this day. Try another date.
                </p>
              ) : (
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {slots.map((slot) => {
                    const isSelected = selectedSlot?.getTime() === slot.getTime();
                    return (
                      <button
                        key={slot.toISOString()}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none ${
                          isSelected
                            ? "border-board bg-board text-white"
                            : "border-ink/15 bg-white text-ink hover:border-board hover:bg-board-light"
                        }`}
                      >
                        {formatSlotTime(slot, zone)}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedSlot && (
        <form action={handleSubmit} className="mt-6 border-t border-ink/10 pt-6">
          <p className="text-sm text-slate">
            Booking{" "}
            <span className="font-medium text-ink">{formatSlotLong(selectedSlot, zone)}</span>
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input name="name" required className={fieldInputClass} />
            </Field>
            <Field label="Email">
              <input name="email" type="email" required className={fieldInputClass} />
            </Field>
            <Field label="Academy name (optional)">
              <input name="academyName" className={fieldInputClass} />
            </Field>
            <Field label="How many students? (optional)">
              <input name="studentCount" placeholder="e.g. 40" className={fieldInputClass} />
            </Field>
          </div>

          <Field label="Anything specific you want us to cover? (optional)" className="mt-4">
            <textarea name="notes" rows={3} className={fieldInputClass} />
          </Field>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-brick-light px-3 py-2 text-sm text-brick">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="mt-5 !px-6 !py-3 text-base">
            {pending ? "Locking it in…" : "Lock in my slot"}
          </Button>
        </form>
      )}
    </div>
  );
}
