import { parseBestMove, parseInfoLine, type EngineInfo } from "./uci";

/**
 * What a search should do with one line the engine emitted.
 *
 * Extracted from StockfishEngine so the rule below is testable — the engine
 * class itself needs a Worker and can't run under Vitest's node environment.
 */
export type SearchLineAction =
  | { kind: "info"; info: EngineInfo }
  | { kind: "done"; bestmove: string | null; ponder: string | null }
  /** Superseded search, engine now idle — safe to re-command. */
  | { kind: "abandon" }
  | { kind: "ignore" };

/**
 * Decide how a running search reacts to `line`.
 *
 * The load-bearing rule: **a superseded search still waits for `bestmove`.**
 * `bestmove` is the only signal the engine has gone idle, and UCI forbids
 * sending `position` to a searching engine. Abandoning on the first line after
 * a supersede — typically an `info` line, since those stream continuously —
 * lets the next search issue its commands mid-search, where the engine
 * silently ignores them. It then never replies, and the board sits empty
 * forever with no error.
 */
export function classifySearchLine(line: string, superseded: boolean): SearchLineAction {
  if (!superseded) {
    const info = parseInfoLine(line);
    if (info) return { kind: "info", info };
  }

  const bestmove = parseBestMove(line);
  if (bestmove) {
    return superseded ? { kind: "abandon" } : { kind: "done", ...bestmove };
  }

  return { kind: "ignore" };
}
