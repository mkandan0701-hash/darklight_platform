/**
 * Strip the tag-pair header from a PGN, leaving just the moves.
 *
 * `chess.pgn()` always emits the seven-tag roster (`[Event "?"]`, `[Site "?"]`,
 * …), which is correct for a PGN you export but is noise in an on-screen move
 * list. Working from the generated PGN rather than rebuilding numbering from
 * `history()` keeps move numbers right for games that don't start from the
 * initial position — where Black can have the first move.
 */
export function movetextFromPgn(pgn: string): string {
  return pgn
    .replace(/\[[^\]]*\]/g, "") // tag pairs
    .replace(/\s+/g, " ")
    .replace(/\s+\*$/, "") // trailing "game still in progress" marker
    .trim();
}
