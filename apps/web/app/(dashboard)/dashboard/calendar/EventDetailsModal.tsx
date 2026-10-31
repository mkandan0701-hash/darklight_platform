"use client";

import { useState } from "react";
import Link from "next/link";
import type { Role } from "@chessplay-clone/shared";
import type { CalendarEvent } from "../../../../lib/calendar/events";
import { meetingButtonLabel } from "../../../../lib/meetingLink";
import { Modal, ModalFooter } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";
import { cancelClassAction, deleteCalendarBlockAction } from "./actions";
import { CATEGORY_STYLES } from "./categoryStyles";
import { StatusPill, bookedZoneNote, callAction, fmtEventWhen } from "./shared";

type Scope = "THIS" | "FOLLOWING" | "ALL";

export function ScopePicker({ value, onChange, verb }: { value: Scope; onChange: (s: Scope) => void; verb: string }) {
  const options: [Scope, string][] = [
    ["THIS", `${verb} this class only`],
    ["FOLLOWING", `${verb} this and following classes`],
    ["ALL", `${verb} all upcoming classes in the series`],
  ];
  return (
    <fieldset className="mt-3 space-y-1.5 text-sm">
      <legend className="mb-1 font-medium text-ink">This class repeats</legend>
      {options.map(([v, label]) => (
        <label key={v} className="flex items-center gap-2">
          <input type="radio" name="scope" checked={value === v} onChange={() => onChange(v)} className="accent-board" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function EventDetailsModal({
  event,
  zone,
  role,
  onClose,
  onEdit,
  onDone,
}: {
  event: CalendarEvent;
  zone: string;
  role: Role;
  onClose: () => void;
  onEdit: (e: CalendarEvent) => void;
  onDone: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [scope, setScope] = useState<Scope>("THIS");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = CATEGORY_STYLES[event.category];
  const isClass = event.category === "CLASS";
  const isBlock = event.category === "HOLIDAY" || event.category === "UNAVAILABLE" || event.category === "OTHER";
  const isStaff = role === "ACADEMY_ADMIN" || role === "COACH";
  // Only classes still ahead move; a held class is part of the record (the
  // action refuses it too).
  const canReschedule = isClass && event.canEdit && event.status === "UPCOMING";
  const zoneNote = bookedZoneNote(event, zone);
  const showJoin = event.meetingUrl && (event.status === "UPCOMING" || event.status === "LIVE");

  async function destroy() {
    setPending(true);
    setError(null);
    const result = await callAction(() =>
      isClass
        ? cancelClassAction({ sessionId: event.sourceId, scope })
        : deleteCalendarBlockAction({ id: event.sourceId })
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone(result.message);
  }

  return (
    <Modal open onClose={onClose} title={event.title} description={fmtEventWhen(event, zone)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.chip}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
        <StatusPill status={event.status} />
        {event.rescheduled && event.status !== "CANCELLED" && (
          <span className="rounded-full bg-gold-light px-2 py-0.5 text-[11px] font-medium text-ink">Rescheduled</span>
        )}
        {event.format && (
          <span className="rounded-full bg-parchment px-2 py-0.5 text-[11px] font-medium text-slate">
            {event.format === "INDIVIDUAL" ? "1-on-1" : "Group"}
          </span>
        )}
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        {zoneNote && (
          <Row label="Timezone">
            <span className="text-slate">{zoneNote}</span>
          </Row>
        )}
        {event.subtitle && <Row label={isBlock ? "For" : "In"}>{event.subtitle}</Row>}
        {event.coachNames.length > 0 && (
          <Row label={event.coachNames.length > 1 ? "Coaches" : "Coach"}>{event.coachNames.join(", ")}</Row>
        )}
        {event.participants && event.category !== "HOMEWORK" && (
          <Row label={event.category === "CLASS" ? "Students" : "Players"}>
            {event.participants.names && event.participants.names.length > 0
              ? event.participants.names.join(", ")
              : `${event.participants.count} ${event.participants.count === 1 ? "person" : "people"}`}
          </Row>
        )}
        {isClass && event.attendance && (event.status === "COMPLETED" || event.status === "LIVE") && (
          <Row label="Attendance">
            {isStaff ? (
              <>
                {event.attendance.marked > 0 ? `${event.attendance.marked} marked` : "Not marked yet"}
                {event.classroomId && (
                  <>
                    {" · "}
                    <Link
                      href={`/dashboard/attendance/${event.classroomId}/${event.sourceId}`}
                      className="font-medium text-board hover:underline"
                    >
                      {event.attendance.marked > 0 ? "View" : "Mark attendance"}
                    </Link>
                  </>
                )}
              </>
            ) : event.attendance.present == null ? (
              "Not marked"
            ) : event.attendance.present ? (
              "Present"
            ) : (
              "Absent"
            )}
          </Row>
        )}
        {event.description && <Row label="Notes">{event.description}</Row>}
      </dl>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-brick-light px-3 py-2 text-sm text-brick">
          {error}
        </p>
      )}

      {confirming ? (
        <div className="mt-4 rounded-lg border border-brick/20 bg-brick-light/40 p-3">
          <p className="text-sm font-medium text-ink">
            {isClass
              ? "Cancel this class? Everyone in the class will see it as cancelled. This can't be undone."
              : "Remove this entry from the calendar?"}
          </p>
          {isClass && event.series && <ScopePicker value={scope} onChange={setScope} verb="Cancel" />}
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={destroy} disabled={pending}>
              {pending ? "Working…" : isClass ? "Cancel class" : "Remove"}
            </Button>
          </ModalFooter>
        </div>
      ) : (
        <ModalFooter>
          {event.canEdit && isClass && event.status === "UPCOMING" && (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Cancel class
            </Button>
          )}
          {event.canEdit && isBlock && (
            <Button variant="destructive" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          )}
          {(canReschedule || (event.canEdit && isBlock)) && (
            <Button variant="secondary" onClick={() => onEdit(event)}>
              {isClass ? "Reschedule" : "Edit"}
            </Button>
          )}
          {event.href && (
            <Link
              href={event.href}
              className="inline-flex items-center justify-center rounded-lg border border-ink/20 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
            >
              {isClass ? "Open class" : "Open"}
            </Link>
          )}
          {showJoin && (
            <a
              href={event.meetingUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg bg-board px-4 py-2.5 text-sm font-medium text-white hover:bg-board-dark"
            >
              {meetingButtonLabel(event.meetingUrl!)}
            </a>
          )}
        </ModalFooter>
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-slate">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}
