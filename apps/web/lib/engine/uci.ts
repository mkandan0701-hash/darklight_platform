// Parsing for the UCI text protocol Stockfish speaks over postMessage.
//
// Pure and I/O-free so it can be unit-tested under Vitest's `environment:
// "node"` — the Worker glue in StockfishEngine.ts stays deliberately thin
// because it cannot be. Everything here is defensive: these strings come off a
// Worker whose output format we don't control, and a parser that throws or
// half-parses takes the board down with it.

/** A parsed `info` line. Fields the engine didn't report are null. */
export type EngineInfo = {
  depth: number | null;
  /** 1 unless the engine is running MultiPV. */
  multipv: number;
  /** Centipawns, from the *side to move's* perspective. */
  scoreCp: number | null;
  /** Moves to mate, signed, from the side to move's perspective. */
  scoreMate: number | null;
  /** Set when the score is only a bound from a fail-high/fail-low, not settled. */
  bound: "upper" | "lower" | null;
  /** Principal variation as UCI moves. Empty when the line carried none. */
  pv: string[];
  nodes: number | null;
  nps: number | null;
  timeMs: number | null;
};

/** Centipawn magnitude a forced mate maps to — above any real evaluation. */
export const MATE_SCORE = 100_000;

function toInt(token: string | undefined): number | null {
  if (token === undefined) return null;
  const n = Number.parseInt(token, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Parse one `info` line.
 *
 * Returns null for lines carrying nothing a UI can render: `info string ...`
 * (free-form engine chatter, including the NNUE banner) and progress-only
 * lines such as `info depth 5 currmove e2e4 currmovenumber 1`.
 */
export function parseInfoLine(line: string): EngineInfo | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "info") return null;

  const info: EngineInfo = {
    depth: null,
    multipv: 1,
    scoreCp: null,
    scoreMate: null,
    bound: null,
    pv: [],
    nodes: null,
    nps: null,
    timeMs: null,
  };
  let sawScore = false;

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case "string":
        // Free-form to end of line — never a structured payload.
        return null;
      case "depth":
        info.depth = toInt(tokens[++i]);
        break;
      case "multipv":
        info.multipv = toInt(tokens[++i]) ?? 1;
        break;
      case "nodes":
        info.nodes = toInt(tokens[++i]);
        break;
      case "nps":
        info.nps = toInt(tokens[++i]);
        break;
      case "time":
        info.timeMs = toInt(tokens[++i]);
        break;
      case "score":
        if (tokens[i + 1] === "cp") {
          info.scoreCp = toInt(tokens[i + 2]);
          i += 2;
          sawScore = true;
        } else if (tokens[i + 1] === "mate") {
          info.scoreMate = toInt(tokens[i + 2]);
          i += 2;
          sawScore = true;
        }
        break;
      case "upperbound":
        info.bound = "upper";
        break;
      case "lowerbound":
        info.bound = "lower";
        break;
      case "pv":
        // Runs to end of line.
        info.pv = tokens.slice(i + 1).filter(Boolean);
        i = tokens.length;
        break;
      default:
        break;
    }
  }

  if (!sawScore && info.pv.length === 0) return null;
  return info;
}

/**
 * Parse a `bestmove` line.
 *
 * Returns null if this isn't one. `bestmove (none)` — which Stockfish sends
 * when the position is already checkmate or stalemate — yields a null
 * `bestmove` rather than the literal string, because naive slicing turns
 * "(none)" into a "(n"→"one" move that crashes chess.js.
 */
export function parseBestMove(
  line: string
): { bestmove: string | null; ponder: string | null } | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== "bestmove") return null;

  const raw = tokens[1];
  const bestmove = !raw || raw === "(none)" || raw === "0000" ? null : raw;
  const ponder = tokens[2] === "ponder" && tokens[3] ? tokens[3] : null;

  return { bestmove, ponder };
}

/** Serialize a move to UCI — the wire format used throughout this app. */
export function uciFromMove(move: {
  from: string;
  to: string;
  promotion?: string;
}): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

/** Inverse of `uciFromMove`. Shape matches what `tryMove` accepts. */
export function moveFromUci(uci: string): {
  from: string;
  to: string;
  promotion?: string;
} {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4) || undefined,
  };
}

/**
 * Build a `position` command.
 *
 * The trailing `moves` clause is omitted entirely when there are none —
 * `position startpos moves` with an empty list is a protocol error.
 */
export function positionCommand(
  startFen: string | "startpos",
  uciMoves: string[]
): string {
  const base = startFen === "startpos" ? "position startpos" : `position fen ${startFen}`;
  return uciMoves.length ? `${base} moves ${uciMoves.join(" ")}` : base;
}

/**
 * Convert an engine score to centipawns from White's point of view.
 *
 * Stockfish always reports relative to the side to move, so an identical
 * "+2.0" means opposite things depending on whose turn it is — getting this
 * wrong flips the eval bar. Mate scores collapse onto ±MATE_SCORE, offset by
 * distance so mate-in-1 outranks mate-in-5.
 *
 * Returns null when the line carried no score.
 */
export function scoreToWhitePov(info: EngineInfo, sideToMove: "w" | "b"): number | null {
  let score: number;
  if (info.scoreMate !== null) {
    const sign = info.scoreMate >= 0 ? 1 : -1;
    score = sign * (MATE_SCORE - Math.abs(info.scoreMate));
  } else if (info.scoreCp !== null) {
    score = info.scoreCp;
  } else {
    return null;
  }
  return sideToMove === "w" ? score : -score;
}
