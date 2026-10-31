import { beforeEach, describe, expect, it, vi } from "vitest";

const tournamentExistsForTenant = vi.fn();

vi.mock("@chessplay-clone/db", () => ({
  runWithTenant: (_tenantId: string, fn: () => unknown) => fn(),
}));
vi.mock("../repositories/tournamentRepository", () => ({
  tournamentExistsForTenant: (...a: unknown[]) => tournamentExistsForTenant(...a),
}));

// Static import: apps/api compiles to commonjs, which has no top-level await.
// Safe because the factory above returns a closure that dereferences the
// vi.fn() at call time, not at factory time.
import { registerTournamentHandlers, tournamentRoom } from "./tournamentRooms";

/** Minimal Socket.io double: enough to drive the handlers and read back. */
function harness(role: string, tenantId = "tenant_1") {
  const handlers = new Map<string, (raw: unknown, ack?: unknown) => unknown>();
  const rooms = new Set<string>();

  const socket = {
    rooms,
    data: {
      session: { tenantId, role },
      appUser: { id: "user_1" },
      displayName: "Someone",
    },
    on(event: string, handler: (raw: unknown, ack?: unknown) => unknown) {
      handlers.set(event, handler);
    },
    join(room: string) {
      rooms.add(room);
      return Promise.resolve();
    },
    leave(room: string) {
      rooms.delete(room);
      return Promise.resolve();
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the double
  // implements only the slice of Socket the handlers touch; typing it fully
  // would mean stubbing dozens of unused members.
  registerTournamentHandlers(socket as any);

  async function emit(event: string, raw: unknown) {
    const acks: unknown[][] = [];
    const handler = handlers.get(event);
    if (!handler) throw new Error(`no handler for ${event}`);
    await handler(raw, (...args: unknown[]) => acks.push(args));
    return acks[0] ?? [];
  }

  return { emit, rooms };
}

beforeEach(() => {
  tournamentExistsForTenant.mockReset();
  tournamentExistsForTenant.mockResolvedValue(true);
});

describe("join-tournament", () => {
  it("joins the room for a tournament in the viewer's academy", async () => {
    const { emit, rooms } = harness("ACADEMY_ADMIN");
    const [ok] = await emit("join-tournament", { tournamentId: "t_1" });
    expect(ok).toBe(true);
    expect(rooms.has(tournamentRoom("t_1"))).toBe(true);
  });

  // The whole access rule. Without the tenantId in the lookup, anyone who
  // learned an id could watch another academy's event.
  it("refuses a tournament belonging to another academy", async () => {
    tournamentExistsForTenant.mockResolvedValue(false);
    const { emit, rooms } = harness("ACADEMY_ADMIN");
    const [ok, , error] = await emit("join-tournament", { tournamentId: "t_other" });
    expect(ok).toBe(false);
    expect(error).toBe("not authorized for this tournament");
    expect(rooms.size).toBe(0);
  });

  it("scopes the lookup to the socket's own tenant, not the payload", async () => {
    const { emit } = harness("STUDENT", "tenant_9");
    await emit("join-tournament", { tournamentId: "t_1" });
    expect(tournamentExistsForTenant).toHaveBeenCalledWith("tenant_9", "t_1");
  });

  // CLAUDE.md §5 puts spectators in this room alongside participants, and the
  // payload carries no names or scores — so watching is open to the academy.
  it.each(["STUDENT", "PARENT", "COACH", "ACADEMY_ADMIN"])("lets a %s watch", async (role) => {
    const { emit, rooms } = harness(role);
    const [ok] = await emit("join-tournament", { tournamentId: "t_1" });
    expect(ok).toBe(true);
    expect(rooms.has(tournamentRoom("t_1"))).toBe(true);
  });

  it("rejects a malformed payload without touching the database", async () => {
    const { emit } = harness("COACH");
    const [ok, , error] = await emit("join-tournament", { tournamentId: "" });
    expect(ok).toBe(false);
    expect(error).toBe("invalid payload");
    expect(tournamentExistsForTenant).not.toHaveBeenCalled();
  });
});

describe("leave-tournament", () => {
  it("removes the room", async () => {
    const { emit, rooms } = harness("STUDENT");
    await emit("join-tournament", { tournamentId: "t_1" });
    const [ok] = await emit("leave-tournament", { tournamentId: "t_1" });
    expect(ok).toBe(true);
    expect(rooms.size).toBe(0);
  });

  it("rejects a malformed payload", async () => {
    const { emit } = harness("STUDENT");
    const [ok, , error] = await emit("leave-tournament", {});
    expect(ok).toBe(false);
    expect(error).toBe("invalid payload");
  });
});
