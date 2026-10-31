import { beforeEach, describe, expect, it, vi } from "vitest";

const add = vi.fn();
const QueueCtor = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class {
    name: string;
    constructor(name: string, opts: unknown) {
      this.name = name;
      QueueCtor(name, opts);
    }
    add(...args: unknown[]) {
      return add(...args);
    }
  },
}));

const { publishTournamentEvent, publishTournamentEventSafely } = await import(
  "./tournamentEventsQueue"
);

const event = {
  tenantId: "tenant_1",
  tournamentId: "t_1",
  kind: "round-published" as const,
  round: 2,
};

beforeEach(() => {
  add.mockReset();
  add.mockResolvedValue(undefined);
  QueueCtor.mockClear();
});

describe("publishTournamentEvent", () => {
  // apps/api consumes by this exact string and nothing type-checks across the
  // process boundary, so a rename on one side alone fails silently.
  it("publishes to the queue apps/api's broadcaster consumes", async () => {
    await publishTournamentEvent(event);
    expect(QueueCtor.mock.calls[0][0]).toBe("tournament-events");
  });

  it("stamps the event so the consumer can drop a stale one", async () => {
    const before = Date.now();
    await publishTournamentEvent(event);
    const data = add.mock.calls[0][1];
    expect(data).toMatchObject({ tournamentId: "t_1", kind: "round-published", round: 2 });
    expect(data.publishedAt).toBeGreaterThanOrEqual(before);
  });

  // A retried broadcast would be discarded as stale by the time it ran, and the
  // viewer's next action refetches anyway.
  it("does not retry a failed broadcast", async () => {
    await publishTournamentEvent(event);
    expect(add.mock.calls[0][2]).toMatchObject({ attempts: 1 });
  });

  // Re-imported so the module-level singleton starts unset: on a warm module
  // it is already built, which would make this assertion vacuous.
  it("builds the queue once and reuses it", async () => {
    vi.resetModules();
    const fresh = await import("./tournamentEventsQueue");
    await fresh.publishTournamentEvent(event);
    await fresh.publishTournamentEvent(event);
    expect(QueueCtor).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(2);
  });
});

describe("publishTournamentEventSafely", () => {
  // The round is already paired by the time this runs. An unreachable Redis
  // must not surface as "could not pair the round".
  it("swallows a failure rather than failing the action that earned it", async () => {
    add.mockRejectedValue(new Error("redis down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(publishTournamentEventSafely(event)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
