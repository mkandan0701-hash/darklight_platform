import { z } from "zod";

// Socket handlers are this service's route boundary, so per CLAUDE.md §7 every
// inbound payload is parsed here before it reaches any game or DB logic. A
// failed parse acks false and goes no further.
//
// Note what these schemas deliberately do *not* accept: any author/identity
// field. Who sent an event is taken from the socket's verified session and
// stamped server-side, never read from the payload.

const squareSchema = z.string().regex(/^[a-h][1-8]$/, "invalid square");
const idSchema = z.string().min(1).max(64);

const liveSessionPayload = z.object({ liveSessionId: idSchema });

export const joinRoomSchema = z.object({
  liveSessionId: idSchema,
  room: z.enum(["shared", "coach"]),
});

const movePayload = z.object({
  liveSessionId: idSchema,
  from: squareSchema,
  to: squareSchema,
  // chess.js accepts these four; anything else means a malformed client.
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

export const moveSchema = movePayload;
export const refBoardMoveSchema = movePayload;

export const drawArrowSchema = z.object({
  liveSessionId: idSchema,
  from: squareSchema,
  to: squareSchema,
});

export const clearArrowsSchema = liveSessionPayload;
export const flipBoardSchema = liveSessionPayload;
export const refBoardClearSchema = liveSessionPayload;

export const chatMessageSchema = z.object({
  liveSessionId: idSchema,
  // Bounded so one client can't push an unbounded string through the adapter
  // to every other member of the room.
  body: z.string().trim().min(1).max(1000),
});

export const audioJoinSchema = liveSessionPayload;
export const audioLeaveSchema = liveSessionPayload;

export const audioSignalSchema = z.object({
  liveSessionId: idSchema,
  // A Socket.io socket id. Whether it's actually a peer in the *same* session
  // is an authorization question, checked in the handler — not here.
  toPeerId: z.string().min(1).max(64),
  // An SDP offer/answer or an ICE candidate. The server relays this opaquely
  // and never parses it, so it's passthrough rather than a modelled shape —
  // the WebRTC payload format is the browsers' business, not ours. Bounded
  // only by the socket layer's own message size limit.
  signal: z.record(z.unknown()),
});

export const refBoardLoadSchema = z.object({
  liveSessionId: idSchema,
  // Validity as a *chess position* is checked by chess.js in the handler; this
  // only bounds the string. A FEN is ~90 chars, so 200 is generous.
  fen: z.string().min(1).max(200),
});

// --- Simul -----------------------------------------------------------------
// A board of a simultaneous exhibition is the same two-player shape as a
// lesson board, so these mirror the live-session payloads — keyed by
// SimulBoard id, since that is what carries both the position and the pair of
// people entitled to move on it.

const simulBoardPayload = z.object({ simulBoardId: idSchema });

export const joinSimulBoardSchema = simulBoardPayload;

export const simulMoveSchema = z.object({
  simulBoardId: idSchema,
  from: squareSchema,
  to: squareSchema,
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

// --- Tournament ------------------------------------------------------------
// The tournament room is watch-only: nothing a client sends into it changes
// state, so there is no move-shaped payload here. Joining and leaving are the
// whole client surface.

const tournamentPayload = z.object({ tournamentId: idSchema });

export const joinTournamentSchema = tournamentPayload;
export const leaveTournamentSchema = tournamentPayload;
