import { describe, expect, it } from "vitest";
import {
  isAtCapacity,
  MAX_AUDIO_PARTICIPANTS,
  participantsReducer,
  shouldInitiateTo,
  type Participant,
} from "./participants";
import { parseStunUrls } from "./iceServers";

const asha: Participant = {
  peerId: "sock_1",
  userId: "user_1",
  name: "asha.rao",
  connected: false,
};

describe("participantsReducer", () => {
  it("adds a joining peer as not-yet-connected", () => {
    const state = participantsReducer([], {
      type: "joined",
      peerId: "sock_1",
      userId: "user_1",
      name: "asha.rao",
    });
    expect(state).toEqual([asha]);
  });

  // A client that reconnects re-announces itself. Appending would show the
  // same person twice in the participant list.
  it("replaces rather than duplicates a peer that re-announces", () => {
    const state = participantsReducer([asha], {
      type: "joined",
      peerId: "sock_1",
      userId: "user_1",
      name: "asha.rao.renamed",
    });
    expect(state).toHaveLength(1);
    expect(state[0].name).toBe("asha.rao.renamed");
  });

  it("removes a peer that leaves and ignores one it doesn't know", () => {
    expect(participantsReducer([asha], { type: "left", peerId: "sock_1" })).toEqual([]);
    expect(participantsReducer([asha], { type: "left", peerId: "ghost" })).toEqual([asha]);
  });

  it("flips connection state without touching identity", () => {
    const state = participantsReducer([asha], {
      type: "connection-state",
      peerId: "sock_1",
      connected: true,
    });
    expect(state[0]).toEqual({ ...asha, connected: true });
  });

  it("clears everything on reset", () => {
    expect(participantsReducer([asha], { type: "reset" })).toEqual([]);
  });
});

describe("shouldInitiateTo", () => {
  // Both peers evaluate this against the same event. If they could both
  // return true, two offers would cross (glare) and the call would fail.
  it("initiates toward another peer but never toward itself", () => {
    expect(shouldInitiateTo("sock_me", "sock_other")).toBe(true);
    expect(shouldInitiateTo("sock_me", "sock_me")).toBe(false);
  });

  it("does not initiate before we know our own peer id", () => {
    expect(shouldInitiateTo(null, "sock_other")).toBe(false);
  });
});

describe("isAtCapacity", () => {
  it("counts the local user, who is not in the participant list", () => {
    expect(isAtCapacity(MAX_AUDIO_PARTICIPANTS - 2)).toBe(false);
    expect(isAtCapacity(MAX_AUDIO_PARTICIPANTS - 1)).toBe(true);
  });
});

describe("parseStunUrls", () => {
  it("falls back to defaults when unset or empty", () => {
    expect(parseStunUrls(undefined).length).toBeGreaterThan(0);
    expect(parseStunUrls("   ")).toEqual(parseStunUrls(undefined));
  });

  it("splits and trims a comma-separated list", () => {
    expect(parseStunUrls("stun:a:1, stun:b:2 ")).toEqual(["stun:a:1", "stun:b:2"]);
  });
});
