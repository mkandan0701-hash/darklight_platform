"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import type { Arrow, Square } from "react-chessboard/dist/chessboard/types";
import { useElementWidth } from "../../../../lib/useElementWidth";
import { tryMove } from "../../../../lib/chess/tryMove";
import { useStockfish } from "../../../../lib/engine/useStockfish";
import { moveFromUci, positionCommand, uciFromMove, type EngineInfo } from "../../../../lib/engine/uci";
import { evalView, formatVariation, pvToSan } from "../../../../lib/engine/evalDisplay";
import { parsePositionInput } from "../../../../lib/engine/positionInput";
import { Button } from "../../../../components/ui/Button";
import { Field, fieldInputClass } from "../../../../components/ui/Field";

/** Depth cap instead of `go infinite`: a forgotten tab must not pin a core. */
const ANALYSIS_DEPTH = 18;
/** Stockfish emits `info` at kHz; batching keeps React off the critical path. */
const FLUSH_INTERVAL_MS = 120;
const ARROW_COLOURS = ["rgb(31 109 76 / 0.6)", "rgb(191 143 0 / 0.5)", "rgb(90 90 90 / 0.4)"];

export function AnalysisBoard() {
  const { status, engine, error: engineError } = useStockfish();

  const [startFen, setStartFen] = useState(() => new Chess().fen());
  const [uciMoves, setUciMoves] = useState<string[]>([]);
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [multipv, setMultipv] = useState(1);
  const [analysing, setAnalysing] = useState(true);
  const [lines, setLines] = useState<EngineInfo[]>([]);
  const [inputText, setInputText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [boardRef, boardWidth] = useElementWidth<HTMLDivElement>(360);

  // Position at the current ply, rebuilt from the flat move list. Cheap, and
  // it keeps navigation a pure function of `ply` — no undo/redo bookkeeping.
  const { fen, sideToMove, moveNumber, sanHistory } = useMemo(() => {
    const chess = new Chess();
    try {
      chess.load(startFen);
    } catch {
      chess.reset();
    }
    const san: string[] = [];
    for (const uci of uciMoves.slice(0, ply)) {
      const move = tryMove(chess, moveFromUci(uci));
      if (!move) break;
      san.push(move.san);
    }
    const full = Number(chess.fen().split(" ")[5] ?? "1");
    return {
      fen: chess.fen(),
      sideToMove: chess.turn() as "w" | "b",
      moveNumber: full,
      sanHistory: san,
    };
  }, [startFen, uciMoves, ply]);

  // Batched info stream. Writing every line straight to state visibly melts
  // the UI — this is the single biggest practical risk in an analysis board.
  const pendingRef = useRef<Map<number, EngineInfo>>(new Map());
  const searchIdRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      if (pendingRef.current.size === 0) return;
      const next = [...pendingRef.current.values()].sort((a, b) => a.multipv - b.multipv);
      pendingRef.current = new Map(pendingRef.current);
      setLines(next);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const analyse = useCallback(async () => {
    if (!engine || status !== "ready") return;
    const searchId = ++searchIdRef.current;
    pendingRef.current = new Map();

    try {
      await engine.search({
        setup: [
          `setoption name MultiPV value ${multipv}`,
          "setoption name UCI_LimitStrength value false",
          "setoption name Skill Level value 20",
        ],
        position: positionCommand(startFen, uciMoves.slice(0, ply)),
        go: `go depth ${ANALYSIS_DEPTH}`,
        timeoutMs: 120_000,
        onInfo: (info) => {
          if (searchIdRef.current !== searchId) return;
          // Bounds aren't settled evaluations — showing them makes the eval
          // bar jitter wildly during a fail-high.
          if (info.bound !== null || info.pv.length === 0) return;
          pendingRef.current.set(info.multipv, info);
        },
      });
    } catch {
      // Timeout or a wedged engine: leave the last good lines on screen.
    }
  }, [engine, status, multipv, startFen, uciMoves, ply]);

  useEffect(() => {
    if (!analysing || status !== "ready") return;
    setLines([]);
    void analyse();
    return () => {
      searchIdRef.current += 1;
      engine?.stop();
    };
  }, [analysing, status, analyse, engine]);

  function loadInput() {
    const result = parsePositionInput(inputText);
    if (!result.ok) {
      setInputError(result.error);
      return;
    }
    setInputError(null);
    setStartFen(result.position.startFen);
    setUciMoves(result.position.uciMoves);
    setPly(result.position.uciMoves.length);
    setLines([]);
  }

  function onPieceDrop(from: Square, to: Square): boolean {
    const chess = new Chess(fen);
    const move = tryMove(chess, { from, to, promotion: "q" });
    if (!move) return false;

    // Playing a move from a rewound position truncates the line, the same as
    // any analysis tool.
    setUciMoves([...uciMoves.slice(0, ply), uciFromMove(move)]);
    setPly(ply + 1);
    setLines([]);
    return true;
  }

  const best = lines[0];
  const view = best ? evalView(best, sideToMove) : null;

  const arrows: Arrow[] = lines
    .slice(0, multipv)
    .map((line, i) => {
      const first = line.pv[0];
      if (!first) return null;
      return [
        first.slice(0, 2) as Square,
        first.slice(2, 4) as Square,
        ARROW_COLOURS[i] ?? ARROW_COLOURS[ARROW_COLOURS.length - 1],
      ] as Arrow;
    })
    .filter((a): a is Arrow => a !== null);

  return (
    <div className="flex flex-wrap items-start gap-8">
      <div className="w-full max-w-[420px]">
        <div className="flex items-stretch gap-2">
          {/* Eval bar: White's share fills from the bottom. */}
          <div
            className="relative w-3 shrink-0 overflow-hidden rounded border border-ink/10 bg-ink"
            aria-hidden
          >
            <div
              className="absolute inset-x-0 bottom-0 bg-white transition-[height] duration-200 motion-reduce:transition-none"
              style={{ height: `${(view?.fraction ?? 0.5) * 100}%` }}
            />
          </div>

          <div
            ref={boardRef}
            className="flex-1 rounded-xl border border-ink/10 bg-white p-3 shadow-sm"
          >
            <Chessboard
              position={fen}
              onPieceDrop={onPieceDrop}
              boardOrientation={orientation}
              customArrows={arrows}
              boardWidth={boardWidth}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setPly(0)} disabled={ply === 0}>
            ⏮
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPly(Math.max(0, ply - 1))}
            disabled={ply === 0}
          >
            ◀
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPly(Math.min(uciMoves.length, ply + 1))}
            disabled={ply >= uciMoves.length}
          >
            ▶
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPly(uciMoves.length)}
            disabled={ply >= uciMoves.length}
          >
            ⏭
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOrientation(orientation === "white" ? "black" : "white")}
          >
            Flip
          </Button>
          <span className="font-mono text-xs text-slate">
            ply {ply}/{uciMoves.length}
          </span>
        </div>
      </div>

      <div className="w-full max-w-md">
        <div className="rounded-xl border border-ink/10 bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-slate">Engine</h2>
            <span className="font-mono text-lg font-semibold text-ink">
              {status === "ready" ? (view?.text ?? "—") : "—"}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate" role="status">
            {status === "loading" && "Loading engine (7 MB — cached after first use)…"}
            {status === "error" && (
              <span className="text-brick">{engineError ?? "Engine failed to load."}</span>
            )}
            {status === "ready" &&
              (analysing
                ? `depth ${best?.depth ?? 0}/${ANALYSIS_DEPTH}${
                    best?.nodes ? ` · ${(best.nodes / 1000).toFixed(0)}k nodes` : ""
                  }`
                : "Paused.")}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Button
              type="button"
              variant={analysing ? "secondary" : "primary"}
              onClick={() => setAnalysing(!analysing)}
              disabled={status !== "ready"}
            >
              {analysing ? "Pause" : "Analyse"}
            </Button>
            <Field label="Lines" className="w-24">
              <select
                value={multipv}
                onChange={(e) => setMultipv(Number(e.target.value))}
                className={fieldInputClass}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </Field>
          </div>

          <ul className="mt-4 space-y-2">
            {lines.slice(0, multipv).map((line, i) => {
              const lineView = evalView(line, sideToMove);
              const san = pvToSan(fen, line.pv);
              return (
                <li key={line.multipv} className="flex gap-2 text-sm">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: ARROW_COLOURS[i] ?? ARROW_COLOURS[0] }}
                    aria-hidden
                  />
                  <span className="w-14 shrink-0 font-mono text-ink">{lineView?.text ?? "—"}</span>
                  <span className="font-mono text-slate">
                    {formatVariation(san, moveNumber, sideToMove)}
                  </span>
                </li>
              );
            })}
            {lines.length === 0 && (
              <li className="text-sm text-slate">
                {status === "ready" && analysing ? "Thinking…" : "No lines yet."}
              </li>
            )}
          </ul>
        </div>

        <div className="mt-4 rounded-xl border border-ink/10 bg-white p-6 shadow-sm">
          <Field
            label="Load a position"
            help="Paste a FEN or a PGN — a Lichess or Chess.com export works as-is."
            error={inputError ?? undefined}
          >
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={4}
              placeholder="1. e4 e5 2. Nf3 …  or  rnbq…/… w KQkq - 0 1"
              className={`${fieldInputClass} font-mono text-xs`}
            />
          </Field>
          <div className="mt-3">
            <Button type="button" onClick={loadInput} disabled={!inputText.trim()}>
              Load
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate">Moves</h2>
          <p className="mt-2 break-words font-mono text-sm text-slate">
            {sanHistory.length ? formatVariation(sanHistory, 1, "w") : "No moves yet."}
          </p>
        </div>
      </div>
    </div>
  );
}
