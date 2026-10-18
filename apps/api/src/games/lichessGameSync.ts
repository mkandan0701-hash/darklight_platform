// Pulls a student's recent Lichess games. Public endpoint, no auth — the
// only limit is fair use (CLAUDE.md §10), which per-student jobs on a
// serialized worker already respect.
//
// The export endpoint streams ND-JSON: one JSON object per line, not a JSON
// array. Parsing is therefore line-by-line, and a single malformed line is
// skipped rather than failing the whole sync — a student losing one game
// from their history is a far better outcome than a nightly job that dies.

import { BLACK_WIN, DRAW, WHITE_WIN, type SyncedGame } from "./types";

const LICHESS_API = "https://lichess.org/api/games/user";

// Statuses with no winner that are still real, completed games. Anything
// else without a winner (aborted, noStart) never happened — see types.ts.
const DRAWN_STATUSES = new Set([
  "draw",
  "stalemate",
  "insufficientMaterialClaim",
  "timeVsInsufficient",
]);

interface LichessGame {
  id?: string;
  pgn?: string;
  createdAt?: number;
  status?: string;
  winner?: "white" | "black";
}

export function parseLichessGame(line: string): SyncedGame | null {
  let game: LichessGame;
  try {
    game = JSON.parse(line) as LichessGame;
  } catch {
    return null;
  }

  if (!game.id || !game.pgn || typeof game.createdAt !== "number") return null;

  const result =
    game.winner === "white"
      ? WHITE_WIN
      : game.winner === "black"
        ? BLACK_WIN
        : DRAWN_STATUSES.has(game.status ?? "")
          ? DRAW
          : null;
  if (!result) return null;

  return {
    externalId: game.id,
    pgn: game.pgn,
    playedAtUtc: new Date(game.createdAt),
    result,
  };
}

export function parseLichessNdjson(body: string): SyncedGame[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLichessGame)
    .filter((g): g is SyncedGame => g !== null);
}

export async function fetchLichessGames(
  handle: string,
  opts: { max?: number; since?: Date } = {}
): Promise<SyncedGame[]> {
  const params = new URLSearchParams({
    max: String(opts.max ?? 30),
    pgnInJson: "true",
    // Tags are what make the stored PGN self-describing (players, event,
    // date) once it is detached from this response.
    tags: "true",
    sort: "dateDesc",
  });
  // `since` makes a nightly re-run cheap: only what is new since last time.
  if (opts.since) params.set("since", String(opts.since.getTime()));

  const response = await fetch(
    `${LICHESS_API}/${encodeURIComponent(handle)}?${params.toString()}`,
    { headers: { Accept: "application/x-ndjson" } }
  );
  if (!response.ok) {
    throw new Error(`Lichess responded ${response.status} for handle "${handle}"`);
  }

  return parseLichessNdjson(await response.text());
}
