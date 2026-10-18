"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import type { Role } from "@chessplay-clone/shared";
import type { CalendarEvent } from "../../../../lib/calendar/events";
import type { ScheduleConflict } from "../../../../lib/calendar/conflicts";
import { Modal, ModalFooter } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";
import { Field, fieldInputClass } from "../../../../components/ui/Field";
import {
  createCalendarClassAction,
  rescheduleClassAction,
  saveCalendarBlockAction,
  type CalendarActionResult,
} from "./actions";
import { zoneOptions } from "./categoryStyles";
import { ScopePicker } from "./EventDetailsModal";
import { ConflictList, callAction, inZone } from "./shared";

export type ClassroomOption = {
  id: string;
  name: string;
  meetingUrl: string | null;
  coachNames: string[];
  studentCount: number;
};
type Option = { id: string; label: string };

export type FormState = { mode: "create"; startLocal: string } | { mode: "edit"; event: CalendarEvent };

type Kind = "CLASS" | "UNAVAILABLE" | "HOLIDAY" | "OTHER";
type Repeat = "NONE" | "DAILY" | "WEEKLY" | "WEEKLY_ONGOING";
type Scope = "THIS" | "FOLLOWING" | "ALL";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240];

export function EventFormModal({
  state,
  zone,
  role,
  ownCoachProfileId,
  classrooms,
  coaches,
  onClose,
  onSaved,
}: {
  state: FormState;
  zone: string;
  role: Role;
  ownCoachProfileId: string | null;
  classrooms: ClassroomOption[];
  coaches: Option[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isAdmin = role === "ACADEMY_ADMIN";
  const editing = state.mode === "edit" ? state.event : null;
  const initialKind: Kind = editing
    ? editing.category === "CLASS"
      ? "CLASS"
      : (editing.category as Kind)
    : "CLASS";
  const [kind, setKind] = useState<Kind>(initialKind);

  const startLocal = editing ? inZone(editing.startUtc, zone).toFormat("yyyy-LL-dd'T'HH:mm") : state.mode === "create" ? state.startLocal : "";
  const start = DateTime.fromISO(startLocal, { zone });

  const kinds: [Kind, string][] = [
    ["CLASS", "Class"],
    ["UNAVAILABLE", "Unavailable"],
    ...(isAdmin ? ([["HOLIDAY", "Holiday"], ["OTHER", "Academy event"]] as [Kind, string][]) : []),
  ];

  const title = editing
    ? editing.category === "CLASS"
      ? `Reschedule ${editing.title}`
      : `Edit ${editing.title}`
    : "Add to calendar";

  return (
    <Modal open onClose={onClose} title={title} description={`Times are in ${zone.replace(/_/g, " ")} unless you change the timezone below.`}>
      {!editing && (
        <>
          <div role="tablist" aria-label="What to add" className="mb-4 flex flex-wrap gap-1 rounded-lg bg-parchment p-1">
            {kinds.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  kind === k ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="-mt-2 mb-4 text-xs text-slate">
            Homework, tournaments and simuls appear here automatically — create them from{" "}
            <Link href="/dashboard/homework" className="font-medium text-board hover:underline">Homework</Link>,{" "}
            <Link href="/dashboard/tournaments" className="font-medium text-board hover:underline">Tournaments</Link> or{" "}
            <Link href="/dashboard/simuls" className="font-medium text-board hover:underline">Simuls</Link>.
          </p>
        </>
      )}

      {kind === "CLASS" ? (
        editing ? (
          <RescheduleForm event={editing} zone={zone} start={start} isAdmin={isAdmin} onSaved={onSaved} onClose={onClose} />
        ) : (
          <CreateClassForm classrooms={classrooms} zone={zone} start={start} isAdmin={isAdmin} onSaved={onSaved} onClose={onClose} />
        )
      ) : (
        <BlockForm
          kind={kind}
          editing={editing}
          zone={zone}
          start={start}
          isAdmin={isAdmin}
          ownCoachProfileId={ownCoachProfileId}
          coaches={coaches}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function useSubmit(onSaved: (m: string) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [canOverride, setCanOverride] = useState(false);

  async function submit(run: (override: boolean) => Promise<CalendarActionResult>, override = false) {
    setPending(true);
    setError(null);
    const result = await callAction(() => run(override));
    setPending(false);
    if (result.ok) {
      onSaved(result.message);
      return;
    }
    setError(result.error);
    setConflicts(result.conflicts ?? []);
    setCanOverride(!!result.canOverride);
  }
  const clear = () => {
    setConflicts([]);
    setError(null);
  };
  return { pending, error, conflicts, canOverride, submit, clear };
}

function Feedback({
  error,
  conflicts,
  zone,
}: {
  error: string | null;
  conflicts: ScheduleConflict[];
  zone: string;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-4 rounded-lg border border-gold/40 bg-gold-light/40 p-3 text-sm text-ink">
      <p className={conflicts.length ? "font-medium" : "text-brick"}>{error}</p>
      {conflicts.length > 0 && <ConflictList conflicts={conflicts} zone={zone} />}
    </div>
  );
}

function SubmitRow({
  pending,
  label,
  onClose,
  overrideAvailable,
  onOverride,
}: {
  pending: boolean;
  label: string;
  onClose: () => void;
  overrideAvailable: boolean;
  onOverride: () => void;
}) {
  return (
    <ModalFooter>
      <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
        Cancel
      </Button>
      {overrideAvailable && (
        <Button type="button" variant="destructive" onClick={onOverride} disabled={pending}>
          Save anyway
        </Button>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
    </ModalFooter>
  );
}

function ZoneSelect({ value, onChange }: { value: string; onChange: (z: string) => void }) {
  return (
    <Field label="Timezone" help="The zone these times are entered in. Everyone sees them in their own zone.">
      <select className={fieldInputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {zoneOptions(value).map((z) => (
          <option key={z} value={z}>
            {z.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** "That's 8:30 AM in America/New_York" — the conversion a coach booking for a NRI family wants to see. */
function ConversionHint({ local, entryZone, viewZone }: { local: string; entryZone: string; viewZone: string }) {
  const dt = DateTime.fromISO(local, { zone: entryZone });
  if (!dt.isValid) return null;
  const shown = dt.setZone(viewZone);
  return (
    <p className="text-xs text-slate">
      {dt.toFormat("cccc d LLL, h:mm a ZZZZ")}
      {entryZone !== viewZone && shown.offset !== dt.offset && (
        <> · {shown.toFormat("ccc h:mm a")} in {viewZone.replace(/_/g, " ")}</>
      )}
    </p>
  );
}

// ---------------------------------------------------------------------------

function CreateClassForm({
  classrooms,
  zone,
  start,
  isAdmin,
  onSaved,
  onClose,
}: {
  classrooms: ClassroomOption[];
  zone: string;
  start: DateTime;
  isAdmin: boolean;
  onSaved: (m: string) => void;
  onClose: () => void;
}) {
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id ?? "");
  const [date, setDate] = useState(start.toFormat("yyyy-LL-dd"));
  const [time, setTime] = useState(start.hour === 0 && start.minute === 0 ? "10:00" : start.toFormat("HH:mm"));
  const [durationMins, setDuration] = useState(60);
  const [entryZone, setEntryZone] = useState(zone);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("NONE");
  const [interval, setRepeatEvery] = useState(1);
  const [weekdays, setWeekdays] = useState<number[]>([start.weekday]);
  const [endKind, setEndKind] = useState<"COUNT" | "UNTIL">("COUNT");
  const [count, setCount] = useState(10);
  const [until, setUntil] = useState(start.plus({ weeks: 10 }).toFormat("yyyy-LL-dd"));
  const { pending, error, conflicts, canOverride, submit, clear } = useSubmit(onSaved);

  const room = classrooms.find((c) => c.id === classroomId);
  const local = `${date}T${time}`;

  if (classrooms.length === 0) {
    return (
      <p className="text-sm text-slate">
        You don&apos;t have any classrooms to schedule into yet.{" "}
        <Link href="/dashboard/classrooms" className="font-medium text-board hover:underline">
          Go to Classrooms
        </Link>
        .
      </p>
    );
  }

  const run = (override: boolean) => {
    const end = endKind === "COUNT" ? { kind: "COUNT" as const, count } : { kind: "UNTIL" as const, until };
    const recurrence =
      repeat === "NONE"
        ? { freq: "NONE" as const }
        : repeat === "DAILY"
          ? { freq: "DAILY" as const, interval, end }
          : repeat === "WEEKLY"
            ? { freq: "WEEKLY" as const, interval, weekdays, end }
            : { freq: "WEEKLY_ONGOING" as const, weekdays };
    return createCalendarClassAction({
      classroomId,
      startLocal: local,
      timezone: entryZone,
      durationMins,
      meetingUrl: repeat === "WEEKLY_ONGOING" ? undefined : meetingUrl,
      recurrence,
      override,
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(run);
  };

  return (
    <form onSubmit={onSubmit} onChange={clear} className="space-y-3">
      <Field label="Classroom">
        <select className={fieldInputClass} value={classroomId} onChange={(e) => setClassroomId(e.target.value)} required>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {room && (
        <p className="-mt-1 text-xs text-slate">
          {room.coachNames.length ? `Coach ${room.coachNames.join(", ")}` : "No coach assigned"} ·{" "}
          {room.studentCount === 1 ? "1-on-1" : `${room.studentCount} students`} — everyone on the roster sees this
          class on their calendar.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" className={fieldInputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Start time">
          <input type="time" className={fieldInputClass} value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="Duration">
          <select className={fieldInputClass} value={durationMins} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} min` : `${d / 60} h`.replace(".5 h", "½ h").replace(".25 h", "¼ h").replace(".75 h", "¾ h")}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ZoneSelect value={entryZone} onChange={setEntryZone} />
      <ConversionHint local={local} entryZone={entryZone} viewZone={zone} />

      <Field label="Repeat">
        <select className={fieldInputClass} value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
          <option value="NONE">Does not repeat</option>
          <option value="DAILY">Daily / every few days</option>
          <option value="WEEKLY">Weekly on chosen days, for a set period</option>
          <option value="WEEKLY_ONGOING">Every week, ongoing</option>
        </select>
      </Field>

      {(repeat === "WEEKLY" || repeat === "WEEKLY_ONGOING") && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">On</legend>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_LABELS.map((label, i) => {
              const d = i + 1;
              const on = weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d]))}
                  className={`h-8 w-11 rounded-md text-xs font-medium ${
                    on ? "bg-board text-white" : "border border-ink/15 bg-white text-ink hover:bg-parchment"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {(repeat === "DAILY" || repeat === "WEEKLY") && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={repeat === "DAILY" ? "Every N days" : "Every N weeks"}>
            <input
              type="number"
              min={1}
              max={52}
              className={fieldInputClass}
              value={interval}
              onChange={(e) => setRepeatEvery(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
          <Field label="Ends">
            <select className={fieldInputClass} value={endKind} onChange={(e) => setEndKind(e.target.value as "COUNT" | "UNTIL")}>
              <option value="COUNT">After a number of classes</option>
              <option value="UNTIL">On a date</option>
            </select>
          </Field>
          {endKind === "COUNT" ? (
            <Field label="Classes">
              <input
                type="number"
                min={1}
                max={104}
                className={fieldInputClass}
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
          ) : (
            <Field label="Last date">
              <input type="date" className={fieldInputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      {repeat === "WEEKLY_ONGOING" ? (
        <p className="text-xs text-slate">
          Becomes a weekly schedule on the classroom. Classes are added eight weeks ahead and topped up nightly, and use
          the classroom&apos;s meeting link.
        </p>
      ) : (
        <Field label="Meeting link (optional)" help="Overrides the classroom's standing link for these classes.">
          <input
            type="url"
            inputMode="url"
            placeholder={room?.meetingUrl ?? "https://meet.google.com/…"}
            className={fieldInputClass}
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
          />
        </Field>
      )}

      <Feedback error={error} conflicts={conflicts} zone={zone} />
      <SubmitRow
        pending={pending}
        label="Schedule"
        onClose={onClose}
        overrideAvailable={isAdmin && canOverride && conflicts.length > 0}
        onOverride={() => submit(run, true)}
      />
    </form>
  );
}

// ---------------------------------------------------------------------------

function RescheduleForm({
  event,
  zone,
  start,
  isAdmin,
  onSaved,
  onClose,
}: {
  event: CalendarEvent;
  zone: string;
  start: DateTime;
  isAdmin: boolean;
  onSaved: (m: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(start.toFormat("yyyy-LL-dd"));
  const [time, setTime] = useState(start.toFormat("HH:mm"));
  const [durationMins, setDuration] = useState(event.durationMins ?? 60);
  const [entryZone, setEntryZone] = useState(zone);
  const [scope, setScope] = useState<Scope>("THIS");
  const { pending, error, conflicts, canOverride, submit, clear } = useSubmit(onSaved);
  const local = `${date}T${time}`;
  const durations = useMemo(() => [...new Set([...DURATIONS, durationMins])].sort((a, b) => a - b), [durationMins]);

  const run = (override: boolean) =>
    rescheduleClassAction({
      sessionId: event.sourceId,
      version: event.version,
      startLocal: local,
      timezone: entryZone,
      durationMins,
      scope,
      override,
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(run);
      }}
      onChange={clear}
      className="space-y-3"
    >
      <p className="text-xs text-slate">
        Everyone in the class sees the new time straight away, labelled as rescheduled.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" className={fieldInputClass} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Start time">
          <input type="time" className={fieldInputClass} value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="Duration">
          <select className={fieldInputClass} value={durationMins} onChange={(e) => setDuration(Number(e.target.value))}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {d} min
              </option>
            ))}
          </select>
        </Field>
      </div>
      <ZoneSelect value={entryZone} onChange={setEntryZone} />
      <ConversionHint local={local} entryZone={entryZone} viewZone={zone} />
      {event.series && <ScopePicker value={scope} onChange={setScope} verb="Move" />}
      {event.series && scope !== "THIS" && (
        <p className="text-xs text-slate">
          Every affected class moves by the same number of days to the same new clock time in the series&apos; own
          timezone, so daylight-saving changes don&apos;t shift them.
        </p>
      )}
      <Feedback error={error} conflicts={conflicts} zone={zone} />
      <SubmitRow
        pending={pending}
        label="Reschedule"
        onClose={onClose}
        overrideAvailable={isAdmin && canOverride && conflicts.length > 0}
        onOverride={() => submit(run, true)}
      />
    </form>
  );
}

// ---------------------------------------------------------------------------

function BlockForm({
  kind,
  editing,
  zone,
  start,
  isAdmin,
  ownCoachProfileId,
  coaches,
  onSaved,
  onClose,
}: {
  kind: Exclude<Kind, "CLASS">;
  editing: CalendarEvent | null;
  zone: string;
  start: DateTime;
  isAdmin: boolean;
  ownCoachProfileId: string | null;
  coaches: Option[];
  onSaved: (m: string) => void;
  onClose: () => void;
}) {
  const entry = editing?.timezone ?? zone;
  const startDt = editing ? inZone(editing.startUtc, entry) : start;
  const endDt = editing
    ? inZone(editing.endUtc, entry).minus(editing.allDay ? { days: 1 } : {})
    : start.plus({ hours: 1 });

  const [title, setTitle] = useState(editing?.title ?? (kind === "UNAVAILABLE" ? "Unavailable" : ""));
  const [allDay, setAllDay] = useState(editing ? editing.allDay : kind === "HOLIDAY");
  const [startDate, setStartDate] = useState(startDt.toFormat("yyyy-LL-dd"));
  const [startTime, setStartTime] = useState(startDt.toFormat("HH:mm"));
  const [endDate, setEndDate] = useState(endDt.toFormat("yyyy-LL-dd"));
  const [endTime, setEndTime] = useState(endDt.toFormat("HH:mm"));
  const [entryZone, setEntryZone] = useState(entry);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [coachProfileId, setCoach] = useState(editing?.coachProfileId ?? ownCoachProfileId ?? coaches[0]?.id ?? "");
  const [staffOnly, setStaffOnly] = useState(editing?.staffOnly ?? false);
  const { pending, error, conflicts, submit, clear } = useSubmit(onSaved);

  const run = () =>
    saveCalendarBlockAction({
      id: editing?.sourceId,
      version: editing?.version,
      kind,
      title,
      description,
      allDay,
      startLocal: `${startDate}T${allDay ? "00:00" : startTime}`,
      endLocal: `${endDate}T${allDay ? "00:00" : endTime}`,
      timezone: entryZone,
      coachProfileId: kind === "UNAVAILABLE" && isAdmin ? coachProfileId : undefined,
      staffOnly,
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(run);
      }}
      onChange={clear}
      className="space-y-3"
    >
      <Field label="Title">
        <input
          className={fieldInputClass}
          value={title}
          maxLength={120}
          required
          placeholder={kind === "HOLIDAY" ? "Diwali break" : kind === "OTHER" ? "Parent–coach meeting" : ""}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      {kind === "UNAVAILABLE" && isAdmin && (
        <Field label="Coach">
          <select className={fieldInputClass} value={coachProfileId} onChange={(e) => setCoach(e.target.value)} required>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-board" />
        All day
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts">
          <div className="flex gap-2">
            <input type="date" className={`${fieldInputClass} min-w-0 flex-1`} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            {!allDay && (
              <input type="time" className={`${fieldInputClass} w-28`} value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            )}
          </div>
        </Field>
        <Field label="Ends">
          <div className="flex gap-2">
            <input type="date" className={`${fieldInputClass} min-w-0 flex-1`} value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            {!allDay && (
              <input type="time" className={`${fieldInputClass} w-28`} value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
            )}
          </div>
        </Field>
      </div>
      {!allDay && <ZoneSelect value={entryZone} onChange={setEntryZone} />}

      <Field label="Notes (optional)">
        <textarea
          className={`${fieldInputClass} min-h-[4rem]`}
          maxLength={1000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {kind === "OTHER" && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={staffOnly} onChange={(e) => setStaffOnly(e.target.checked)} className="accent-board" />
          Staff only — hide from students and parents
        </label>
      )}
      {kind === "UNAVAILABLE" && (
        <p className="text-xs text-slate">
          Visible to academy admins and {isAdmin ? "that coach" : "you"} only. Classes can&apos;t be booked over it
          without an admin override.
        </p>
      )}
      {kind === "HOLIDAY" && (
        <p className="text-xs text-slate">Shown to everyone in the academy. New classes can&apos;t be booked over it without an admin override.</p>
      )}

      <Feedback error={error} conflicts={conflicts} zone={zone} />
      <SubmitRow pending={pending} label={editing ? "Save" : "Add"} onClose={onClose} overrideAvailable={false} onOverride={() => {}} />
    </form>
  );
}
