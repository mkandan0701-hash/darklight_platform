// Pairing for both tournament formats.
//
// Pure and I/O-free so the rules can be tested directly: pairing bugs are
// invisible until a real event is underway, and by then the round is already
// on everyone's screen. Ids here are TournamentParticipant ids, not
// StudentProfile ids — a pairing is meaningful only inside its tournament.

export interface PairingPlayer {
  id: string;
  score: number;
  /** Opponent participant ids already faced, oldest first. */
  opponents: string[];
  /** Colours already held, oldest first. */
  colors: ("w" | "b")[];
  hadBye: boolean;
}

export interface Pairing {
  whiteId: string;
  /** Null is a bye: a full point, no opponent. */
  blackId: string | null;
}

/** Highest score first; id breaks ties so a round is reproducible. */
function byStandings(a: PairingPlayer, b: PairingPlayer): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

function colorBalance(player: PairingPlayer): number {
  return player.colors.reduce((sum, c) => sum + (c === "w" ? 1 : -1), 0);
}

/**
 * Who takes White.
 *
 * Whoever has had White less often relative to Black gets it, which is what
 * stops a player being handed the same colour all event. Ties fall to the
 * player who had Black last, and failing that to the higher-ranked one.
 */
export function assignColors(a: PairingPlayer, b: PairingPlayer): Pairing {
  const balanceA = colorBalance(a);
  const balanceB = colorBalance(b);

  if (balanceA !== balanceB) {
    return balanceA < balanceB
      ? { whiteId: a.id, blackId: b.id }
      : { whiteId: b.id, blackId: a.id };
  }

  const lastA = a.colors[a.colors.length - 1];
  const lastB = b.colors[b.colors.length - 1];
  if (lastA !== lastB) {
    return lastA === "b" ? { whiteId: a.id, blackId: b.id } : { whiteId: b.id, blackId: a.id };
  }

  // Equal balance and equal (or absent) last colour: the standings decide.
  return { whiteId: a.id, blackId: b.id };
}

/**
 * Swiss: pair within score groups, never repeat an opponent if there is any
 * alternative, and give the bye to the player who can least afford to lose
 * board time — the lowest-scoring player who has not had one.
 *
 * The rematch rule is a strong preference, not an invariant: in a small
 * academy field a late round can genuinely run out of fresh opponents, and a
 * repeat pairing beats refusing to generate the round at all. Same for the
 * bye — if everyone has had one, it goes round again from the bottom.
 */
export function pairSwiss(players: PairingPlayer[]): Pairing[] {
  const ordered = [...players].sort(byStandings);
  const pairings: Pairing[] = [];

  let byePlayer: PairingPlayer | undefined;
  if (ordered.length % 2 === 1) {
    // Scan upward from the bottom of the standings for someone bye-less.
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (!ordered[i].hadBye) {
        byePlayer = ordered[i];
        break;
      }
    }
    byePlayer ??= ordered[ordered.length - 1];
    ordered.splice(ordered.indexOf(byePlayer), 1);
  }

  const remaining = [...ordered];
  while (remaining.length > 1) {
    const player = remaining.shift()!;

    let opponentIndex = remaining.findIndex((c) => !player.opponents.includes(c.id));
    // Everyone left has already been played — take the nearest in score.
    if (opponentIndex === -1) opponentIndex = 0;

    const [opponent] = remaining.splice(opponentIndex, 1);
    pairings.push(assignColors(player, opponent));
  }

  if (byePlayer) pairings.push({ whiteId: byePlayer.id, blackId: null });
  return pairings;
}

/**
 * Arena: pair whoever is free by nearest score, avoiding an immediate
 * rematch. No byes — an odd player out simply waits for the next pairing
 * rather than being handed a free point, which is what separates arena
 * scoring from Swiss.
 */
export function pairArena(players: PairingPlayer[]): Pairing[] {
  const remaining = [...players].sort(byStandings);
  const pairings: Pairing[] = [];

  while (remaining.length > 1) {
    const player = remaining.shift()!;
    const lastOpponent = player.opponents[player.opponents.length - 1];

    // Nearest in score is simply the next one along, since the field is
    // already sorted — skip them only to dodge back-to-back rematches.
    let opponentIndex = remaining.findIndex((c) => c.id !== lastOpponent);
    if (opponentIndex === -1) opponentIndex = 0;

    const [opponent] = remaining.splice(opponentIndex, 1);
    pairings.push(assignColors(player, opponent));
  }

  return pairings;
}

export function pairRound(
  format: "SWISS" | "ARENA",
  players: PairingPlayer[]
): Pairing[] {
  return format === "SWISS" ? pairSwiss(players) : pairArena(players);
}

/** Points a result is worth to White and Black. A bye is a full point. */
export function scoreForResult(result: string): { white: number; black: number } {
  switch (result) {
    case "1-0":
      return { white: 1, black: 0 };
    case "0-1":
      return { white: 0, black: 1 };
    case "1/2-1/2":
      return { white: 0.5, black: 0.5 };
    default:
      return { white: 0, black: 0 };
  }
}

export const BYE_RESULT = "1-0";
