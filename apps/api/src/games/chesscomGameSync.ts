// Pulls a student's recent Chess.com games. Public endpoint, no auth, but
// rate-limited to 300 requests / 5 min per IP (CLAUDE.md §10) — which is why
// this fetches whole monthly archives (one request per month) rather than
// per-game, and why the worker runs these jobs serially.
//
// Chess.com has no "since" parameter: games are grouped into monthly archive
// URLs. Syncing the current month plus the previous one covers the boundary
// case of a nightly run just after midnight on the 1st.

import { BLACK_WIN, DRAW, WHITE_WIN, type SyncedGame } from "./types";

const CHESSCOM_API = "https://api.chess.com/pub/player";

// Chess.com states the outcome per side. Exactly one side says "win" in a
// decisive game; in a draw both carry the same drawing reason.
const DRAW_RESULTS = new Set([
  "agreed",
  "repetition",
  "stalemate",
  "insufficient",
  "50move",
  "timevsinsufficient",
]);

interface ChesscomGame {
  uuid?: string;
  pgn?: string;
  end_time?: number;
  white?: { result?: string };
  black?: { result?: string };
}

export function parseChesscomGame(game: ChesscomGame): SyncedGame | null {
  if (!game.uuid || !game.pgn || typeof game.end_time !== "number") return null;

  const white = game.white?.result;
  const black = game.black?.result;

  const result =
    white === "win"
      ? WHITE_WIN
      : black === "win"
        ? BLACK_WIN
        : DRAW_RESULTS.has(white ?? "") && DRAW_RESULTS.has(black ?? "")
          ? DRAW
          : null;
  // Null covers abandoned games and any result string Chess.com adds later:
  // skipping an unknown outcome is safer than guessing a draw.
  if (!result) return null;

  return {
    externalId: game.uuid,
    pgn: game.pgn,
    // end_time is Unix *seconds*, not milliseconds.
    playedAtUtc: new Date(game.end_time * 1000),
    result,
  };
}

export function parseChesscomArchive(body: unknown): SyncedGame[] {
  const games = (body as { games?: ChesscomGame[] })?.games;
  if (!Array.isArray(games)) return [];
  return games.map(parseChesscomGame).filter((g): g is SyncedGame => g !== null);
}

/** Archive paths for `monthsBack` months ending with the current month. */
export function archiveMonths(now: Date, monthsBack: number): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return months;
}

export async function fetchChesscomGames(
  handle: string,
  opts: { now?: Date; monthsBack?: number } = {}
): Promise<SyncedGame[]> {
  const months = archiveMonths(opts.now ?? new Date(), opts.monthsBack ?? 2);
  const all: SyncedGame[] = [];

  for (const { year, month } of months) {
    const url = `${CHESSCOM_API}/${encodeURIComponent(handle.toLowerCase())}/games/${year}/${String(month).padStart(2, "0")}`;
    // Chess.com blocks requests without a descriptive User-Agent.
    const response = await fetch(url, {
      headers: { "User-Agent": "chessplay-clone-academy-sync/1.0" },
    });

    // A month a player didn't play in is a 404, not an error worth failing on.
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`Chess.com responded ${response.status} for handle "${handle}"`);
    }
    all.push(...parseChesscomArchive(await response.json()));
  }

  return all;
}
