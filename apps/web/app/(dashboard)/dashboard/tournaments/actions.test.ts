import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSession = vi.fn();
const createTournament = vi.fn();
const getTournament = vi.fn();
const registerParticipant = vi.fn();
const createPairings = vi.fn();
const getPairing = vi.fn();
const recordPairingResult = vi.fn();
const publishTournamentEventSafely = vi.fn();

vi.mock("../../../../lib/auth/session", () => ({
  getCurrentSession: () => getCurrentSession(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../../../lib/queues/tournamentEventsQueue", () => ({
  publishTournamentEventSafely: (...a: unknown[]) => publishTournamentEventSafely(...a),
}));
vi.mock("../../../../repositories/tournamentRepository", () => ({
  createTournament: (...a: unknown[]) => createTournament(...a),
  getTournament: (...a: unknown[]) => getTournament(...a),
  registerParticipant: (...a: unknown[]) => registerParticipant(...a),
  createPairings: (...a: unknown[]) => createPairings(...a),
  getPairing: (...a: unknown[]) => getPairing(...a),
  recordPairingResult: (...a: unknown[]) => recordPairingResult(...a),
}));

const {
  createTournamentAction,
  generateRoundAction,
  recordResultAction,
  registerParticipantAction,
} = await import("./actions");

const sessionAs = (role: string) => ({
  id: "user_1",
  tenantId: "tenant_1",
  role,
  email: "c@x.test",
  timezone: "Asia/Kolkata",
});

const participant = (id: string, score = 0) => ({ id, studentId: `s_${id}`, score });

function tournament(over: Record<string, unknown> = {}) {
  return {
    id: "t_1",
    format: "SWISS",
    participants: [participant("p1"), participant("p2")],
    pairings: [],
    ...over,
  };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  [
    getCurrentSession,
    createTournament,
    getTournament,
    registerParticipant,
    createPairings,
    getPairing,
    recordPairingResult,
    publishTournamentEventSafely,
  ].forEach((m) => m.mockReset());

  getCurrentSession.mockResolvedValue(sessionAs("COACH"));
  getTournament.mockResolvedValue(tournament());
  createPairings.mockResolvedValue({ count: 1 });
  getPairing.mockResolvedValue({ id: "pair_1", tournamentId: "t_1", round: 2, result: null });
  recordPairingResult.mockResolvedValue({});
});

describe("createTournamentAction", () => {
  it("refuses students and parents", async () => {
    for (const role of ["STUDENT", "PARENT"]) {
      getCurrentSession.mockResolvedValue(sessionAs(role));
      expect(
        await createTournamentAction(
          form({ name: "Club Champs", format: "SWISS", startsLocal: "2026-10-03T10:00" })
        )
      ).toMatchObject({ ok: false });
      expect(createTournament).not.toHaveBeenCalled();
    }
  });

  // Entered on the organiser's clock, stored UTC: 10:00 IST is 04:30 UTC.
  it("converts the start time from the organiser's timezone to UTC", async () => {
    await createTournamentAction(
      form({ name: "Club Champs", format: "SWISS", startsLocal: "2026-10-03T10:00" })
    );
    const arg = createTournament.mock.calls[0][0];
    expect(arg.startsAtUtc.toISOString()).toBe("2026-10-03T04:30:00.000Z");
    expect(arg).toMatchObject({ tenantId: "tenant_1", name: "Club Champs", format: "SWISS" });
  });
});

describe("registerParticipantAction", () => {
  it("refuses a student entering themselves", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    expect(
      await registerParticipantAction(form({ tournamentId: "t_1", studentId: "s_1" }))
    ).toMatchObject({ ok: false });
    expect(registerParticipant).not.toHaveBeenCalled();
  });

  it("enters a player for a coach", async () => {
    expect(
      await registerParticipantAction(form({ tournamentId: "t_1", studentId: "s_1" }))
    ).toEqual({ ok: true });
    expect(registerParticipant).toHaveBeenCalledWith("tenant_1", "t_1", "s_1");
  });
});

describe("generateRoundAction", () => {
  it("refuses a field of fewer than two players", async () => {
    getTournament.mockResolvedValue(tournament({ participants: [participant("p1")] }));
    expect(await generateRoundAction(form({ tournamentId: "t_1" }))).toEqual({
      ok: false,
      error: "At least two players are needed to pair a round",
    });
    expect(createPairings).not.toHaveBeenCalled();
  });

  // Pairing off half-final standings seats people against the wrong
  // opponents, and a round everyone can already see cannot be withdrawn.
  it("refuses while the current round still has an unfinished game", async () => {
    getTournament.mockResolvedValue(
      tournament({
        pairings: [{ id: "x", round: 1, whiteId: "p1", blackId: "p2", result: null }],
      })
    );
    expect(await generateRoundAction(form({ tournamentId: "t_1" }))).toEqual({
      ok: false,
      error: "Finish the current round before pairing the next one",
    });
    expect(createPairings).not.toHaveBeenCalled();
  });

  it("pairs round 1 for a fresh tournament", async () => {
    await generateRoundAction(form({ tournamentId: "t_1" }));
    const [tenantId, tournamentId, round, pairings] = createPairings.mock.calls[0];
    expect({ tenantId, tournamentId, round }).toEqual({
      tenantId: "tenant_1",
      tournamentId: "t_1",
      round: 1,
    });
    expect(pairings).toEqual([{ whiteId: "p1", blackId: "p2", result: null }]);
  });

  it("pairs the next round once the previous one is complete", async () => {
    getTournament.mockResolvedValue(
      tournament({
        participants: [participant("p1", 1), participant("p2", 0)],
        pairings: [{ id: "x", round: 1, whiteId: "p1", blackId: "p2", result: "1-0" }],
      })
    );
    await generateRoundAction(form({ tournamentId: "t_1" }));
    expect(createPairings.mock.calls[0][2]).toBe(2);
  });

  // A bye with no result would block every future round, since the next
  // pairing refuses to run while anything is unfinished.
  it("scores a bye immediately instead of leaving it open", async () => {
    const byePairing = { id: "bye_1", round: 1, whiteId: "p3", blackId: null, result: "1-0" };
    getTournament
      .mockResolvedValueOnce(
        tournament({ participants: [participant("p1"), participant("p2"), participant("p3")] })
      )
      .mockResolvedValueOnce(tournament({ pairings: [byePairing] }));

    await generateRoundAction(form({ tournamentId: "t_1" }));

    const written = createPairings.mock.calls[0][3];
    expect(written).toContainEqual({ whiteId: "p3", blackId: null, result: "1-0" });
    expect(recordPairingResult).toHaveBeenCalledWith(
      "tenant_1",
      "bye_1",
      "1-0",
      { white: 1, black: 0 },
      { white: 0, black: 0 }
    );
  });
});

describe("recordResultAction", () => {
  it("refuses a student recording their own result", async () => {
    getCurrentSession.mockResolvedValue(sessionAs("STUDENT"));
    expect(
      await recordResultAction(form({ tournamentId: "t_1", pairingId: "pair_1", result: "1-0" }))
    ).toMatchObject({ ok: false });
    expect(recordPairingResult).not.toHaveBeenCalled();
  });

  it("records a result with the points it is worth", async () => {
    await recordResultAction(form({ tournamentId: "t_1", pairingId: "pair_1", result: "1/2-1/2" }));
    expect(recordPairingResult).toHaveBeenCalledWith(
      "tenant_1",
      "pair_1",
      "1/2-1/2",
      { white: 0.5, black: 0.5 },
      { white: 0, black: 0 }
    );
  });

  // Correcting a typo must move the standings by the difference, not add a
  // second win on top of the first.
  it("backs out the previous result when one is being corrected", async () => {
    getPairing.mockResolvedValue({ id: "pair_1", tournamentId: "t_1", result: "1-0" });
    await recordResultAction(form({ tournamentId: "t_1", pairingId: "pair_1", result: "0-1" }));
    expect(recordPairingResult).toHaveBeenCalledWith(
      "tenant_1",
      "pair_1",
      "0-1",
      { white: 0, black: 1 },
      { white: 1, black: 0 }
    );
  });

  // Rights to this tournament must not make another one's pairing editable.
  it("refuses a pairing from a different tournament", async () => {
    getPairing.mockResolvedValue({ id: "pair_1", tournamentId: "other", result: null });
    expect(
      await recordResultAction(form({ tournamentId: "t_1", pairingId: "pair_1", result: "1-0" }))
    ).toEqual({ ok: false, error: "Pairing not found in this tournament" });
    expect(recordPairingResult).not.toHaveBeenCalled();
  });

  it("rejects a result string that is not a real chess result", async () => {
    expect(
      await recordResultAction(form({ tournamentId: "t_1", pairingId: "pair_1", result: "2-0" }))
    ).toMatchObject({ ok: false });
    expect(recordPairingResult).not.toHaveBeenCalled();
  });
});


// The live tournament room (claude.md §5). apps/web cannot reach apps/api's
// Socket.io directly, so these actions enqueue and the API server re-emits.
describe("live tournament push", () => {
  it("announces a paired round, with its number", async () => {
    await generateRoundAction(form({ tournamentId: "t_1" }));
    expect(publishTournamentEventSafely).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      tournamentId: "t_1",
      kind: "round-published",
      round: 1,
    });
  });

  it("announces a recorded result", async () => {
    await recordResultAction(form({ tournamentId: "t_1", pairingId: "pair_1", result: "1-0" }));
    expect(publishTournamentEventSafely).toHaveBeenCalledWith({
      tenantId: "tenant_1",
      tournamentId: "t_1",
      kind: "result-recorded",
      round: 2,
    });
  });

  // The pairings are committed before the push runs, so an unreachable Redis
  // must never surface as a round that failed to pair — the organiser would
  // try again and get a duplicate round. That swallow lives in
  // publishTournamentEventSafely (covered in tournamentEventsQueue.test.ts);
  // what this file pins is that the actions call *that* variant. The mock
  // above deliberately exposes only the safe one, so switching either call
  // site to the throwing publishTournamentEvent fails the two tests above
  // with a TypeError rather than silently making a Redis outage the
  // organiser's problem.

  it("announces nothing when the round was refused", async () => {
    getTournament.mockResolvedValue(tournament({ participants: [participant("p1")] }));
    await generateRoundAction(form({ tournamentId: "t_1" }));
    expect(publishTournamentEventSafely).not.toHaveBeenCalled();
  });
});