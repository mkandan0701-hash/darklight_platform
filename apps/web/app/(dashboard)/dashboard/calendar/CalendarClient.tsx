"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateTime } from "luxon";
import type { Role } from "@chessplay-clone/shared";
import {
  eventsByDay,
  filterEvents,
  type CalendarEvent,
  type ClientFilters,
} from "../../../../lib/calendar/events";
import { parseClientFilters } from "../../../../lib/calendar/params";
import { daysInRange, shiftAnchor, viewRange, type CalendarView } from "../../../../lib/calendar/range";
import type { ScheduleConflict } from "../../../../lib/calendar/conflicts";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ICON_PROPS,
  Plus,
  Search,
  SlidersHorizontal,
} from "../../../../components/ui/icons";
import { Modal, ModalFooter } from "../../../../components/ui/Modal";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { rescheduleClassAction } from "./actions";
import { AgendaView } from "./AgendaView";
import { CATEGORY_STYLES, FILTER_CATEGORIES, zoneOptions } from "./categoryStyles";
import { EventDetailsModal, ScopePicker } from "./EventDetailsModal";
import { EventFormModal, type ClassroomOption, type FormState } from "./EventFormModal";
import { MonthView, isMovable, type DropTarget } from "./MonthView";
import { ConflictList, Popover, callAction, fmtEventWhen, inZone, selectClass } from "./shared";
import { TimeGridView } from "./TimeGridView";

type Option = { id: string; label: string };

const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
  agenda: "Agenda",
};

type PendingMove = {
  event: CalendarEvent;
  toStartUtc: string;
  scope: "THIS" | "FOLLOWING" | "ALL";
  pending: boolean;
  error?: string;
  conflicts?: ScheduleConflict[];
  canOverride?: boolean;
};

export function CalendarClient(props: {
  events: CalendarEvent[];
  view: CalendarView;
  anchor: string;
  label: string;
  zone: string;
  userZone: string;
  today: string;
  role: Role;
  ownCoachProfileId: string | null;
  coachOptions: Option[];
  studentOptions: Option[];
  childOptions: Option[];
  classroomOptions: ClassroomOption[];
  selected: { coach?: string; student?: string; child?: string };
  emptyReason: string | null;
}) {
  const { view, zone, role } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const isAdmin = role === "ACADEMY_ADMIN";
  const isStaff = isAdmin || role === "COACH";
  const anchor = useMemo(() => DateTime.fromFormat(props.anchor, "yyyy-LL-dd", { zone }), [props.anchor, zone]);

  // ---- URL state ----------------------------------------------------------
  // Server params navigate (new data, new authorization check); client params
  // are written with replaceState so filtering never refetches or resets the
  // month being looked at.

  const navigate = useCallback(
    (patch: Record<string, string | undefined>) => {
      const qs = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v) qs.set(k, v);
        else qs.delete(k);
      }
      startTransition(() => router.push(`${pathname}?${qs.toString()}`, { scroll: false }));
    },
    [pathname, router]
  );

  const [filters, setFilters] = useState<ClientFilters>(() => parseClientFilters((k) => searchParams.get(k)));
  const [searchDraft, setSearchDraft] = useState(filters.q);

  const applyFilters = useCallback(
    (next: ClientFilters) => {
      setFilters(next);
      const qs = new URLSearchParams(window.location.search);
      const set = (k: string, v: string, dflt: string) => (v && v !== dflt ? qs.set(k, v) : qs.delete(k));
      set("types", next.categories.join(","), "");
      set("status", next.status, "ALL");
      set("format", next.format, "ALL");
      set("q", next.q.trim(), "");
      window.history.replaceState(null, "", `${pathname}?${qs.toString()}`);
    },
    [pathname]
  );

  // Debounced search.
  useEffect(() => {
    if (searchDraft === filters.q) return;
    const t = setTimeout(() => applyFilters({ ...filters, q: searchDraft }), 250);
    return () => clearTimeout(t);
  }, [searchDraft, filters, applyFilters]);

  // ---- Optimistic moves ----------------------------------------------------
  const [overrides, setOverrides] = useState<Record<string, { startUtc: string; endUtc: string }>>({});
  // Fresh server data supersedes anything optimistic.
  useEffect(() => setOverrides({}), [props.events]);

  const events = useMemo(
    () => props.events.map((e) => (overrides[e.id] ? { ...e, ...overrides[e.id] } : e)),
    [props.events, overrides]
  );
  const visible = useMemo(() => filterEvents(events, filters), [events, filters]);

  const days = useMemo(() => {
    const { start, end } = viewRange(view, anchor);
    return daysInRange(start, end);
  }, [view, anchor]);
  const byDay = useMemo(() => eventsByDay(visible, days, zone), [visible, days, zone]);

  // ---- Dialogs and notices -------------------------------------------------
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [move, setMove] = useState<PendingMove | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (notice?.tone !== "success") return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const done = (message: string) => {
    setDetail(null);
    setForm(null);
    setNotice({ tone: "success", text: message });
  };

  const canCreate = isStaff;
  const openCreate = (startLocal: string) => setForm({ mode: "create", startLocal });

  function onDrop(eventId: string, target: DropTarget) {
    const e = events.find((x) => x.id === eventId);
    if (!e || !isMovable(e)) return;
    const from = inZone(e.startUtc, zone);
    const day = DateTime.fromFormat(target.day, "yyyy-LL-dd", { zone });
    const to =
      target.minutes === undefined
        ? day.set({ hour: from.hour, minute: from.minute })
        : day.set({ hour: Math.floor(target.minutes / 60), minute: target.minutes % 60 });
    if (to.toMillis() === from.toMillis()) return;
    setMove({ event: e, toStartUtc: to.toUTC().toISO()!, scope: "THIS", pending: false });
  }

  async function confirmMove(override: boolean) {
    if (!move) return;
    const { event, toStartUtc, scope } = move;
    const durationMs = new Date(event.endUtc).getTime() - new Date(event.startUtc).getTime();
    const endUtc = new Date(new Date(toStartUtc).getTime() + durationMs).toISOString();

    setMove({ ...move, pending: true, error: undefined });
    // Optimistic: the chip jumps now; rolled back below if the save fails.
    setOverrides((o) => ({ ...o, [event.id]: { startUtc: toStartUtc, endUtc } }));

    const result = await callAction(() =>
      rescheduleClassAction({
        sessionId: event.sourceId,
        version: event.version,
        startLocal: inZone(toStartUtc, zone).toFormat("yyyy-LL-dd'T'HH:mm"),
        timezone: zone,
        durationMins: event.durationMins,
        scope,
        override,
      })
    );

    if (!result.ok) {
      setOverrides((o) => {
        const { [event.id]: _rolledBack, ...rest } = o;
        return rest;
      });
      setMove({
        ...move,
        pending: false,
        error: result.error,
        conflicts: result.conflicts,
        canOverride: result.canOverride,
      });
      return;
    }
    setMove(null);
    setNotice({ tone: "success", text: result.message });
  }

  // ---- Render --------------------------------------------------------------
  const toggleCategory = (c: (typeof FILTER_CATEGORIES)[number]) => {
    const on = filters.categories.includes(c);
    applyFilters({ ...filters, categories: on ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] });
  };

  const filtersActive =
    filters.categories.length > 0 || filters.status !== "ALL" || filters.format !== "ALL" || !!filters.q;

  return (
    <div className="mt-5 space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 bg-white p-2 shadow-sm">
        <button
          type="button"
          onClick={() => navigate({ date: props.today })}
          className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm font-medium text-ink hover:bg-parchment"
        >
          Today
        </button>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => navigate({ date: shiftAnchor(view, anchor, -1).toFormat("yyyy-LL-dd") })}
            className="rounded-lg p-1.5 text-slate hover:bg-parchment hover:text-ink"
          >
            <ChevronLeft {...ICON_PROPS} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => navigate({ date: shiftAnchor(view, anchor, 1).toFormat("yyyy-LL-dd") })}
            className="rounded-lg p-1.5 text-slate hover:bg-parchment hover:text-ink"
          >
            <ChevronRight {...ICON_PROPS} aria-hidden="true" />
          </button>
        </div>
        <MonthPicker anchor={anchor} label={props.label} onPick={(d) => navigate({ date: d })} />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {props.childOptions.length > 1 && (
            <div role="group" aria-label="Child" className="flex rounded-lg bg-parchment p-0.5">
              {props.childOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={props.selected.child === c.id}
                  onClick={() => navigate({ child: c.id })}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${
                    props.selected.child === c.id ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {isAdmin && (
            <select
              aria-label="Coach"
              value={props.selected.coach ?? ""}
              onChange={(e) => navigate({ coach: e.target.value || undefined })}
              className={`${selectClass} py-1.5`}
            >
              <option value="">All coaches</option>
              {props.coachOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          <div role="tablist" aria-label="View" className="flex rounded-lg border border-ink/10 bg-parchment/60 p-0.5">
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => navigate({ view: v === "month" ? undefined : v })}
                className={`rounded-md px-2.5 py-1 text-sm font-medium sm:px-4 ${
                  view === v ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <Popover
            label="Calendar settings and filters"
            align="right"
            buttonClassName={`relative rounded-lg p-2 hover:bg-parchment ${
              filters.format !== "ALL" || props.selected.student || zone !== props.userZone ? "text-board" : "text-slate"
            }`}
            button={<SlidersHorizontal {...ICON_PROPS} aria-hidden="true" />}
          >
            {() => (
              <div className="space-y-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-ink">Show times in</span>
                  <select
                    value={zone}
                    onChange={(e) => navigate({ tz: e.target.value === props.userZone ? undefined : e.target.value })}
                    className={selectClass}
                  >
                    {zoneOptions(props.userZone, zone).map((z) => (
                      <option key={z} value={z}>
                        {z.replace(/_/g, " ")}
                        {z === props.userZone ? " (yours)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {isStaff && props.studentOptions.length > 0 && (
                  <label className="flex flex-col gap-1">
                    <span className="font-medium text-ink">Student</span>
                    <select
                      value={props.selected.student ?? ""}
                      onChange={(e) => navigate({ student: e.target.value || undefined })}
                      className={selectClass}
                    >
                      <option value="">All students</option>
                      {props.studentOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-ink">Class format</span>
                  <select
                    value={filters.format}
                    onChange={(e) => applyFilters({ ...filters, format: e.target.value as ClientFilters["format"] })}
                    className={selectClass}
                  >
                    <option value="ALL">Group and 1-on-1</option>
                    <option value="GROUP">Group classes</option>
                    <option value="INDIVIDUAL">1-on-1 classes</option>
                  </select>
                </label>
              </div>
            )}
          </Popover>

          {canCreate && (
            <Button onClick={() => openCreate(`${props.anchor}T00:00`)} className="py-1.5">
              <Plus {...ICON_PROPS} size={16} aria-hidden="true" />
              <span className="hidden sm:inline">New</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_CATEGORIES.map((c) => {
          const style = CATEGORY_STYLES[c];
          const on = filters.categories.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggleCategory(c)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                on ? style.pillOn : style.pillOff
              } ${filters.categories.length > 0 && !on ? "opacity-50" : ""}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
              {style.label}
            </button>
          );
        })}
        <span className="mx-1 hidden h-5 w-px bg-ink/10 sm:block" aria-hidden="true" />
        {(["ALL", "UPCOMING", "COMPLETED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filters.status === s}
            onClick={() => applyFilters({ ...filters, status: s })}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filters.status === s
                ? "border-ink/20 bg-ink/10 text-ink"
                : "border-ink/10 bg-white text-ink hover:bg-parchment"
            }`}
          >
            {s === "ALL" ? "All" : s[0] + s.slice(1).toLowerCase()}
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-56">
          <span className="sr-only">Search events</span>
          <Search
            {...ICON_PROPS}
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate"
          />
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder={isStaff ? "Search title, student, coach" : "Search events"}
            className="w-full rounded-full border border-ink/10 bg-white py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-slate/70 focus-visible:border-board focus-visible:ring-2 focus-visible:ring-board"
          />
        </label>
      </div>

      {/* Status line */}
      <div aria-live="polite" className="min-h-0">
        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`rounded-lg px-3 py-2 text-sm ${
              notice.tone === "success" ? "bg-board-light text-board-dark" : "bg-brick-light text-brick"
            }`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {/* Views */}
      <div className={`relative transition-opacity ${isPending ? "opacity-60" : ""}`} aria-busy={isPending}>
        {isPending && (
          <div className="absolute inset-x-0 -top-1.5 z-20 h-0.5 overflow-hidden rounded-full bg-board-light" aria-hidden="true">
            <div className="h-full w-1/3 animate-pulse bg-board" />
          </div>
        )}
        {props.emptyReason ? (
          <EmptyState
            icon={<CalendarDays {...ICON_PROPS} aria-hidden="true" />}
            title="No calendar to show"
            description={props.emptyReason}
          />
        ) : view === "month" ? (
          <MonthView
            anchor={anchor}
            days={days}
            zone={zone}
            today={props.today}
            byDay={byDay}
            canCreate={canCreate}
            onCreate={(day) => openCreate(`${day}T00:00`)}
            onOpen={setDetail}
            onShowDay={(day) => navigate({ view: "day", date: day })}
            onDrop={onDrop}
          />
        ) : view === "agenda" ? (
          <AgendaView events={visible} zone={zone} today={props.today} onOpen={setDetail} />
        ) : (
          <TimeGridView
            days={days}
            zone={zone}
            today={props.today}
            byDay={byDay}
            canCreate={canCreate}
            onCreate={openCreate}
            onOpen={setDetail}
            onDrop={onDrop}
          />
        )}
        {!props.emptyReason && visible.length === 0 && view !== "agenda" && (
          <p className="mt-3 text-center text-sm text-slate">
            {filtersActive ? "No events match these filters in this period." : "Nothing scheduled in this period."}
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  applyFilters({ categories: [], status: "ALL", q: "", format: "ALL" });
                }}
                className="ml-2 font-medium text-board hover:underline"
              >
                Clear filters
              </button>
            )}
          </p>
        )}
      </div>

      <p className="text-xs text-slate">
        Times shown in {zone.replace(/_/g, " ")}
        {zone !== props.userZone ? ` (your profile zone is ${props.userZone.replace(/_/g, " ")})` : ""}.
        {isStaff ? " Drag an upcoming class to reschedule it." : ""}
      </p>

      {detail && (
        <EventDetailsModal
          event={detail}
          zone={zone}
          role={role}
          onClose={() => setDetail(null)}
          onEdit={(e) => {
            setDetail(null);
            setForm({ mode: "edit", event: e });
          }}
          onDone={done}
        />
      )}

      {form && (
        <EventFormModal
          state={form}
          zone={zone}
          role={role}
          ownCoachProfileId={props.ownCoachProfileId}
          classrooms={props.classroomOptions}
          coaches={props.coachOptions}
          onClose={() => setForm(null)}
          onSaved={done}
        />
      )}

      {move && (
        <Modal
          open
          onClose={() => !move.pending && setMove(null)}
          title={`Reschedule ${move.event.title}?`}
          description="Everyone in the class will see the new time."
        >
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-12 text-slate">From</dt>
              <dd className="text-ink line-through decoration-slate/50">
                {fmtEventWhen(props.events.find((e) => e.id === move.event.id) ?? move.event, zone)}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-12 text-slate">To</dt>
              <dd className="font-medium text-ink">
                {fmtEventWhen(
                  {
                    ...move.event,
                    startUtc: move.toStartUtc,
                    endUtc: new Date(
                      new Date(move.toStartUtc).getTime() +
                        (new Date(move.event.endUtc).getTime() - new Date(move.event.startUtc).getTime())
                    ).toISOString(),
                  },
                  zone
                )}
              </dd>
            </div>
          </dl>
          {move.event.series && (
            <ScopePicker value={move.scope} onChange={(scope) => setMove({ ...move, scope })} verb="Move" />
          )}
          {move.error && (
            <div role="alert" className="mt-3 rounded-lg border border-gold/40 bg-gold-light/40 p-3 text-sm text-ink">
              <p className={move.conflicts?.length ? "font-medium" : "text-brick"}>{move.error}</p>
              {move.conflicts && move.conflicts.length > 0 && <ConflictList conflicts={move.conflicts} zone={zone} />}
            </div>
          )}
          <ModalFooter>
            <Button variant="secondary" onClick={() => setMove(null)} disabled={move.pending}>
              Cancel
            </Button>
            {move.canOverride && (move.conflicts?.length ?? 0) > 0 && (
              <Button variant="destructive" onClick={() => confirmMove(true)} disabled={move.pending}>
                Move anyway
              </Button>
            )}
            <Button onClick={() => confirmMove(false)} disabled={move.pending}>
              {move.pending ? "Moving…" : "Move class"}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}

function MonthPicker({ anchor, label, onPick }: { anchor: DateTime; label: string; onPick: (date: string) => void }) {
  const [year, setYear] = useState(anchor.year);
  useEffect(() => setYear(anchor.year), [anchor.year]);
  return (
    <Popover
      label="Choose month"
      buttonClassName="inline-flex items-center gap-2 rounded-lg bg-parchment px-3 py-1.5 text-sm font-semibold text-ink hover:bg-slate-light/60"
      button={
        <>
          <CalendarDays {...ICON_PROPS} size={16} aria-hidden="true" className="text-slate" />
          {label}
          <ChevronDown {...ICON_PROPS} size={14} aria-hidden="true" className="text-slate" />
        </>
      }
    >
      {(close) => (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous year" onClick={() => setYear(year - 1)} className="rounded p-1 hover:bg-parchment">
              <ChevronLeft {...ICON_PROPS} size={16} aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-ink">{year}</span>
            <button type="button" aria-label="Next year" onClick={() => setYear(year + 1)} className="rounded p-1 hover:bg-parchment">
              <ChevronRight {...ICON_PROPS} size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const current = m === anchor.month && year === anchor.year;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onPick(DateTime.fromObject({ year, month: m, day: 1 }).toFormat("yyyy-LL-dd"));
                    close();
                  }}
                  className={`rounded-md py-1.5 text-sm ${current ? "bg-ink text-white" : "text-ink hover:bg-parchment"}`}
                >
                  {DateTime.fromObject({ month: m }).toFormat("LLL")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}
