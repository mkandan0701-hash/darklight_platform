import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  DEFAULT_CLIENT_FILTERS,
  clockStatus,
  eventsByDay,
  filterEvents,
  layoutDay,
  type CalendarEvent,
} from "./events";
import { parseClientFilters, parseServerParams } from "./params";

function ev(over: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "category">): CalendarEvent {
  return {
    sourceId: over.id,
    title: over.id,
    startUtc: "2026-10-17T12:30:00.000Z",
    endUtc: "2026-10-17T13:30:00.000Z",
    allDay: false,
    status: "UPCOMING",
    rescheduled: false,
    coachNames: [],
    canEdit: false,
    ...over,
  };
}

describe("filterEvents", () => {
  const events = [
    ev({ id: "class-up", category: "CLASS", format: "GROUP", participants: { count: 3, names: ["Arjun Rao"] } }),
    ev({ id: "class-done", category: "CLASS", format: "INDIVIDUAL", status: "COMPLETED" }),
    ev({ id: "class-off", category: "CLASS", format: "GROUP", status: "CANCELLED" }),
    ev({ id: "hw", category: "HOMEWORK", status: "UPCOMING" }),
    ev({ id: "tourn", category: "TOURNAMENT", status: "COMPLETED" }),
    ev({ id: "holiday", category: "HOLIDAY", allDay: true }),
  ];
  const ids = (f: Partial<typeof DEFAULT_CLIENT_FILTERS>) =>
    filterEvents(events, { ...DEFAULT_CLIENT_FILTERS, ...f }).map((e) => e.id);

  it("combines category and status filters", () => {
    expect(ids({ categories: ["CLASS"], status: "UPCOMING" })).toEqual(["class-up", "holiday"]);
    expect(ids({ categories: ["CLASS", "TOURNAMENT"], status: "COMPLETED" })).toEqual(["class-done", "tourn"]);
    expect(ids({ status: "CANCELLED" })).toEqual(["class-off"]);
  });

  it("keeps holidays visible under a category filter — the academy being shut is always relevant", () => {
    expect(ids({ categories: ["HOMEWORK"] })).toEqual(["hw", "holiday"]);
  });

  it("filters class format", () => {
    expect(ids({ format: "INDIVIDUAL" })).toEqual(["class-done", "holiday"]);
  });

  it("searches participant names only when the server sent them", () => {
    expect(ids({ q: "arjun" })).toEqual(["class-up"]);
  });
});

describe("eventsByDay", () => {
  const days = (zone: string) =>
    [0, 1, 2].map((i) => DateTime.fromISO("2026-10-17", { zone }).plus({ days: i }).startOf("day"));

  it("files an event under the viewer's local day, not the UTC one", () => {
    // 23:00 UTC Saturday is Sunday morning in Bengaluru.
    const e = ev({ id: "late", category: "CLASS", startUtc: "2026-10-17T23:00:00.000Z", endUtc: "2026-10-17T23:45:00.000Z" });
    expect(eventsByDay([e], days("Asia/Kolkata"), "Asia/Kolkata").get("2026-10-18")).toHaveLength(1);
    expect(eventsByDay([e], days("America/New_York"), "America/New_York").get("2026-10-17")).toHaveLength(1);
  });

  it("shows a multi-day holiday on every day, but not the day its end-midnight falls on", () => {
    const e = ev({
      id: "break",
      category: "HOLIDAY",
      allDay: true,
      startUtc: "2026-10-16T18:30:00.000Z", // 17 Oct 00:00 IST
      endUtc: "2026-10-18T18:30:00.000Z", //   19 Oct 00:00 IST
    });
    const map = eventsByDay([e], days("Asia/Kolkata"), "Asia/Kolkata");
    expect([...map.entries()].filter(([, l]) => l.length).map(([k]) => k)).toEqual(["2026-10-17", "2026-10-18"]);
  });

  it("files homework under its deadline's day", () => {
    const e = ev({
      id: "hw",
      category: "HOMEWORK",
      startUtc: "2026-10-17T18:10:00.000Z", // 17 Oct 23:40 IST
      endUtc: "2026-10-17T18:40:00.000Z", //   18 Oct 00:10 IST
    });
    const map = eventsByDay([e], days("Asia/Kolkata"), "Asia/Kolkata");
    expect(map.get("2026-10-17")).toHaveLength(0);
    expect(map.get("2026-10-18")).toHaveLength(1);
  });
});

describe("layoutDay", () => {
  const day = DateTime.fromISO("2026-10-17", { zone: "UTC" }).startOf("day");

  it("places overlapping events side by side and others full width", () => {
    const out = layoutDay(
      [
        ev({ id: "a", category: "CLASS", startUtc: "2026-10-17T10:00:00Z", endUtc: "2026-10-17T11:00:00Z" }),
        ev({ id: "b", category: "CLASS", startUtc: "2026-10-17T10:30:00Z", endUtc: "2026-10-17T11:30:00Z" }),
        ev({ id: "c", category: "CLASS", startUtc: "2026-10-17T13:00:00Z", endUtc: "2026-10-17T14:00:00Z" }),
      ],
      day
    );
    const byId = Object.fromEntries(out.map((p) => [p.event.id, p]));
    expect(byId.a).toMatchObject({ top: 600, height: 60, column: 0, columns: 2 });
    expect(byId.b).toMatchObject({ column: 1, columns: 2 });
    expect(byId.c).toMatchObject({ column: 0, columns: 1 });
  });

  it("positions by wall clock on a DST-change day", () => {
    const ny = DateTime.fromISO("2026-11-01", { zone: "America/New_York" }).startOf("day");
    // 15:00 UTC on 1 Nov is 10:00 EST — after the 2 AM fall-back.
    const [p] = layoutDay([ev({ id: "x", category: "CLASS", startUtc: "2026-11-01T15:00:00Z", endUtc: "2026-11-01T16:00:00Z" })], ny);
    expect(p.top).toBe(600);
  });
});

describe("clockStatus", () => {
  it("derives upcoming / live / completed from the clock", () => {
    const s = new Date("2026-10-17T10:00:00Z");
    const e = new Date("2026-10-17T11:00:00Z");
    expect(clockStatus(s, e, new Date("2026-10-17T09:59:00Z"))).toBe("UPCOMING");
    expect(clockStatus(s, e, new Date("2026-10-17T10:30:00Z"))).toBe("LIVE");
    expect(clockStatus(s, e, new Date("2026-10-17T11:00:00Z"))).toBe("COMPLETED");
  });
});

describe("URL params", () => {
  it("parses leniently, dropping anything malformed", () => {
    expect(parseServerParams({ view: "week", date: "2026-10-18", coach: "c_1", student: "x'; drop" })).toEqual({
      view: "week",
      date: "2026-10-18",
      tz: undefined,
      coach: "c_1",
      student: undefined,
      child: undefined,
    });
    expect(parseServerParams({ view: "year" }).view).toBe("month");
  });

  it("reads client filters", () => {
    const qs = new URLSearchParams("types=CLASS,BOGUS,SIMUL&status=COMPLETED&format=nope&q=priya");
    expect(parseClientFilters((k) => qs.get(k))).toEqual({
      categories: ["CLASS", "SIMUL"],
      status: "COMPLETED",
      q: "priya",
      format: "ALL",
    });
  });
});
