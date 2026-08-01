"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow, Square } from "react-chessboard/dist/chessboard/types";
import { useElementWidth } from "../../../../lib/useElementWidth";
import { tryMove } from "../../../../lib/chess/tryMove";
import { movetextFromPgn } from "../../../../lib/chess/movetext";
import { exportPgn } from "../../../../lib/chess/exportPgn";
import { useStockfish } from "../../../../lib/engine/useStockfish";
import { moveFromUci, positionCommand, uciFromMove } from "../../../../lib/engine/uci";
import {
  DEFAULT_ENGINE_LEVEL_ID,
  ENGINE_LEVELS,
  budgetMsForLevel,
  goCommandForLevel,
  isEngineLevelId,
  optionCommandsForLevel,
  type EngineLevelId,
} from "../../../../lib/engine/difficulty";
import { describeOutcome, resignationOutcome, type Outcome } from "../../../../lib/engine/gameOutcome";
import { Button } from "../../../../components/ui/Button";
import { Field, fieldInputClass } from "../../../../components/ui/Field";

type PlayerColor = "w" | "b";

/** Extra headroom over the level's own budget before we call the engine wedged. */
const SEARCH_TIMEOUT_MARGIN_MS = 5_000;

export function PlayVsEngineBoard() {
  const { status, engine, error: engineError } = useStockfish();

  // Mutable instance drives legality; `position` is what re-renders the board.
  // Same shape as PuzzleAttemptBoard.
  const chess = useMemo(() => new Chess(), []);
  const [position, setPosition] = useState(() => chess.fen());
  const [uciMoves, setUciMoves] = useState<string[]>([]);
  const [playerColor, setPlayerColor] = useState<PlayerColor>("w");
  const [level, setLevel] = useState<EngineLevelId>(DEFAULT_ENGINE_LEVEL_ID);
  const [thinking, setThinking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ over: false });
  const [lastEngineMove, setLastEngineMove] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [boardRef, boardWidth] = useElementWidth<HTMLDivElement>(360);

  // Guards every await: a New game or colour switch mid-search must not have
  // the stale reply played onto the fresh board.
  const gameIdRef = useRef(0);

  const syncFromChess = useCallback(() => {
    setPosition(chess.fen());
    setUciMoves(chess.history({ verbose: true }).map(uciFromMove));
  }, [chess]);

  const runEngineMove = useCallback(
    async (gameId: number) => {
      if (!engine) return;
      setThinking(true);
      try {
        const result = await engine.search({
          setup: optionCommandsForLevel(level),
          position: positionCommand(
            "startpos",
            chess.history({ verbose: true }).map(uciFromMove)
          ),
          go: goCommandForLevel(level),
          timeoutMs: budgetMsForLevel(level) + SEARCH_TIMEOUT_MARGIN_MS,
        });

        if (gameIdRef.current !== gameId || result.superseded) return;
        if (!result.bestmove) return; // already mate or stalemate

        if (tryMove(chess, moveFromUci(result.bestmove))) {
          setLastEngineMove(result.bestmove);
          syncFromChess();
          setOutcome(describeOutcome(chess, playerColor));
        }
      } catch {
        if (gameIdRef.current === gameId) {
          setOutcome({ over: false });
        }
      } finally {
        if (gameIdRef.current === gameId) setThinking(false);
      }
    },
    [chess, engine, level, playerColor, syncFromChess]
  );

  // When the student plays Black the engine opens, so it has to move as soon
  // as the board is ready rather than waiting for a drop.
  useEffect(() => {
    if (status !== "ready" || outcome.over) return;
    if (chess.turn() === playerColor || thinking) return;
    void runEngineMove(gameIdRef.current);
    // runEngineMove is stable per level/colour; re-running on `position` is
    // what drives the engine's reply after each of the player's moves.
  }, [status, position, playerColor, outcome.over]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPieceDrop(sourceSquare: Square, targetSquare: Square): boolean {
    if (status !== "ready" || thinking || outcome.over) return false;
    if (chess.turn() !== playerColor) return false;

    const move = tryMove(chess, {
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    if (!move) return false;

    setLastEngineMove(null);
    syncFromChess();

    const next = describeOutcome(chess, playerColor);
    setOutcome(next);
    // The effect above fires the engine's reply once `position` updates.
    return true;
  }

  function startNewGame(color: PlayerColor = playerColor, nextLevel: EngineLevelId = level) {
    gameIdRef.current += 1;
    engine?.newGame();
    chess.reset();
    setPlayerColor(color);
    setLevel(nextLevel);
    setThinking(false);
    setOutcome({ over: false });
    setLastEngineMove(null);
    setCopied(false);
    syncFromChess();
  }

  function takeBack() {
    if (thinking) return;
    gameIdRef.current += 1;
    // Two plies: the engine's reply and the player's own move.
    chess.undo();
    if (chess.turn() !== playerColor) chess.undo();
    setThinking(false);
    setOutcome({ over: false });
    setLastEngineMove(null);
    syncFromChess();
  }

  function resign() {
    gameIdRef.current += 1;
    engine?.stop();
    setThinking(false);
    setOutcome(resignationOutcome(playerColor));
  }

  async function copyPgn() {
    const engineName = `Stockfish (${ENGINE_LEVELS.find((l) => l.id === level)?.label ?? level})`;
    const pgn = exportPgn(chess, {
      white: playerColor === "w" ? "You" : engineName,
      black: playerColor === "w" ? engineName : "You",
      result: outcome.over ? outcome.result : "*",
    });
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const engineArrows: Arrow[] = lastEngineMove
    ? [
        [
          lastEngineMove.slice(0, 2) as Square,
          lastEngineMove.slice(2, 4) as Square,
          "rgb(31 109 76 / 0.55)",
        ],
      ]
    : [];

  const canDrag = status === "ready" && !thinking && !outcome.over;

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="w-full max-w-[420px]">
        <div
          ref={boardRef}
          className="rounded-xl border border-ink/10 bg-white p-3 shadow-sm"
        >
          <Chessboard
            position={position}
            onPieceDrop={onPieceDrop}
            arePiecesDraggable={canDrag}
            isDraggablePiece={({ piece }) => piece[0] === playerColor}
            boardOrientation={playerColor === "w" ? "white" : "black"}
            customArrows={engineArrows}
            boardWidth={boardWidth}
          />
        </div>

        <p className="mt-3 min-h-[1.25rem] text-sm" role="status">
          {status === "loading" && (
            <span className="text-slate">
              Loading engine (7 MB — cached after the first game)…
            </span>
          )}
          {status === "error" && (
            <span className="text-brick">{engineError ?? "Could not start the engine."}</span>
          )}
          {status === "ready" && outcome.over && (
            <span
              className={
                outcome.forPlayer === "win"
                  ? "font-medium text-board-dark"
                  : outcome.forPlayer === "loss"
                    ? "text-brick"
                    : "text-ink"
              }
            >
              {outcome.reason}
            </span>
          )}
          {status === "ready" && !outcome.over && thinking && (
            <span className="text-slate">Engine is thinking…</span>
          )}
          {status === "ready" && !outcome.over && !thinking && (
            <span className="text-slate">
              {chess.turn() === playerColor ? "Your move." : "Engine to move."}
            </span>
          )}
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-4 rounded-xl border border-ink/10 bg-white p-6 shadow-sm">
          <Field label="Engine level" help={ENGINE_LEVELS.find((l) => l.id === level)?.blurb}>
            <select
              value={level}
              onChange={(e) =>
                isEngineLevelId(e.target.value) && startNewGame(playerColor, e.target.value)
              }
              className={fieldInputClass}
            >
              {ENGINE_LEVELS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Play as">
            <select
              value={playerColor}
              onChange={(e) => startNewGame(e.target.value as PlayerColor, level)}
              className={fieldInputClass}
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => startNewGame()}>
              New game
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={takeBack}
              disabled={thinking || uciMoves.length === 0}
            >
              Take back
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={resign}
              disabled={outcome.over || uciMoves.length === 0}
            >
              Resign
            </Button>
          </div>

          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={copyPgn}
              disabled={uciMoves.length === 0}
              className="px-0"
            >
              {copied ? "PGN copied" : "Copy PGN"}
            </Button>
            <p className="mt-1 text-xs text-slate">
              Games aren&apos;t saved — copy the PGN to keep or analyse one.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate">Moves</h2>
          <p className="mt-2 break-words font-mono text-sm text-slate">
            {uciMoves.length ? movetextFromPgn(chess.pgn()) : "No moves yet."}
          </p>
        </div>
      </div>
    </div>
  );
}
