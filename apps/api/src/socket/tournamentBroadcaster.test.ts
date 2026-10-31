import { describe, expect, it, vi } from "vitest";

// bullmq is imported for the Worker factory only; constructing one would open a
// Redis connection, and the processor is exported separately precisely so the
// interesting logic can be tested without a server.
vi.mock("bullmq", () => ({ Worker: class {} }));
vi.mock("../redis", () => ({ createBullConnection: () => ({}) }));

import {
  broadcastTournamentEvent,
  MAX_EVENT_AGE_MS,
  TOURNAMENT_EVENTS_QUEUE,
} from "./tournamentBroadcaster";

function fakeIo() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  return {
    emitted,
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
}

const now = Date.UTC(2026, 0, 1, 12, 0, 0);
const event = (over: Record<string, unknown> = {}) => ({
  tenantId: "tenant_1",
  tournamentId: "t_1",
  kind: "round-published",
  round: 3,
  publishedAt: now,
  ...over,
});

describe("broadcastTournamentEvent", () => {
  it("emits into that tournament's room", () => {
    const io = fakeIo();
    expect(broadcastTournamentEvent(io, event(), now)).toEqual({
      emitted: true,
      room: "tournament:t_1",
    });
    expect(io.emitted).toEqual([
      {
        room: "tournament:t_1",
        event: "tournament-updated",
        payload: { tournamentId: "t_1", kind: "round-published", round: 3 },
      },
    ]);
  });

  // The payload is a nudge, not a feed: clients refetch the page through their
  // own authorization. If names or scores ever start riding along here, room
  // membership becomes a data-leak question instead of a convenience.
  it("carries no player names or scores", () => {
    const io = fakeIo();
    broadcastTournamentEvent(io, event({ tenantId: "tenant_secret" }), now);
    const payload = io.emitted[0].payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["kind", "round", "tournamentId"]);
    // Not even the tenant id — the client already knows its own.
    expect(payload).not.toHaveProperty("tenantId");
  });

  // A durable queue holding ephemeral fan-out. If every API instance is down
  // while results are recorded, these land on restart and would tell viewers
  // "just updated" about an hour-old round. Delete this guard and a deploy
  // during a tournament produces a refetch storm afterwards.
  it("drops an event older than the freshness window", () => {
    const io = fakeIo();
    const outcome = broadcastTournamentEvent(
      io,
      event({ publishedAt: now - 10 * 60_000 }),
      now
    );
    expect(outcome).toEqual({ emitted: false, reason: "stale" });
    expect(io.emitted).toEqual([]);
  });

  it("still emits one right at the edge of the window", () => {
    const io = fakeIo();
    const outcome = broadcastTournamentEvent(
      io,
      event({ publishedAt: now - MAX_EVENT_AGE_MS }),
      now
    );
    expect(outcome).toMatchObject({ emitted: true });
  });

  it("ignores a job whose shape it doesn't recognise rather than throwing", () => {
    const io = fakeIo();
    expect(broadcastTournamentEvent(io, { tournamentId: "t_1" }, now)).toEqual({
      emitted: false,
      reason: "invalid payload",
    });
    expect(broadcastTournamentEvent(io, { ...event(), kind: "chat" }, now)).toEqual({
      emitted: false,
      reason: "invalid payload",
    });
    expect(io.emitted).toEqual([]);
  });

  it("omits the round when the event doesn't have one", () => {
    const io = fakeIo();
    const { round, ...withoutRound } = event();
    void round;
    broadcastTournamentEvent(io, withoutRound, now);
    expect(io.emitted[0].payload).toEqual({
      tournamentId: "t_1",
      kind: "round-published",
      round: undefined,
    });
  });
});

describe("queue name", () => {
  // apps/web enqueues by this exact string; nothing type-checks across the two
  // processes, so a rename on one side alone is silent.
  it("is the contract apps/web publishes to", () => {
    expect(TOURNAMENT_EVENTS_QUEUE).toBe("tournament-events");
  });
});
