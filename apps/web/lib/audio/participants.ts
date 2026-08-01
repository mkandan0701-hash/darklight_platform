// Pure participant-list logic, split out from the hook so it can be tested
// without a browser. Everything WebRTC-specific stays in useAudioMesh.

export type Participant = {
  peerId: string;
  userId: string;
  name: string;
  /** Set once the peer connection reaches "connected". */
  connected: boolean;
};

export type ParticipantEvent =
  | { type: "joined"; peerId: string; userId: string; name: string }
  | { type: "left"; peerId: string }
  | { type: "connection-state"; peerId: string; connected: boolean }
  | { type: "reset" };

export function participantsReducer(
  state: Participant[],
  event: ParticipantEvent
): Participant[] {
  switch (event.type) {
    case "joined": {
      // A reconnecting client can re-announce under a peer id we already hold
      // (or a stale one we haven't reaped yet). Replace rather than append, so
      // the roster can't show the same person twice.
      const existing = state.find((p) => p.peerId === event.peerId);
      if (existing) {
        return state.map((p) =>
          p.peerId === event.peerId
            ? { ...p, userId: event.userId, name: event.name }
            : p
        );
      }
      return [
        ...state,
        {
          peerId: event.peerId,
          userId: event.userId,
          name: event.name,
          connected: false,
        },
      ];
    }
    case "left":
      return state.filter((p) => p.peerId !== event.peerId);
    case "connection-state":
      return state.map((p) =>
        p.peerId === event.peerId ? { ...p, connected: event.connected } : p
      );
    case "reset":
      return [];
  }
}

// Whichever side is already in the call opens the connection; the newcomer
// waits to be offered to. Both peers run this against the same event, so they
// must never both answer true — that would be glare, two offers crossing, and
// a failed connection.
export function shouldInitiateTo(
  myPeerId: string | null,
  joinedPeerId: string
): boolean {
  if (!myPeerId) return false;
  // Our own join echoes back to us; offering to ourselves is not a call.
  return myPeerId !== joinedPeerId;
}

/** Cap chosen for a mesh: every peer holds a connection to every other. */
export const MAX_AUDIO_PARTICIPANTS = 6;

export function isAtCapacity(participantCount: number): boolean {
  // +1 for the local user, who isn't in the participant list.
  return participantCount + 1 >= MAX_AUDIO_PARTICIPANTS;
}
