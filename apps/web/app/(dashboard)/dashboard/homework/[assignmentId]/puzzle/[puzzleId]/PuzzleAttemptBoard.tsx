"use client";

import { useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { submitPuzzleAttemptAction } from "../../../actions";
import { useElementWidth } from "../../../../../../../lib/useElementWidth";
import { tryMove } from "../../../../../../../lib/chess/tryMove";

type Feedback = { kind: "solved" } | { kind: "wrong" } | null;

export function PuzzleAttemptBoard({
  assignmentId,
  puzzleId,
  fen,
  solutionMoves,
}: {
  assignmentId: string;
  puzzleId: string;
  fen: string;
  solutionMoves: string;
}) {
  // The local Chess instance drives board legality/highlighting only — it is
  // advisory, not authoritative. The server independently recomputes
  // correctness from the puzzle's real stored solution on every submit.
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [position, setPosition] = useState(fen);
  const [boardRef, boardWidth] = useElementWidth<HTMLDivElement>(360);
  const [submittedMoves, setSubmittedMoves] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef(Date.now());
  const solved = feedback?.kind === "solved";
  const solutionLength = solutionMoves.split(" ").filter(Boolean).length;

  function resetToLastCorrectPosition(priorMoves: string[]) {
    chess.load(fen);
    for (const uci of priorMoves) {
      chess.move({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: uci.slice(4) || undefined,
      });
    }
    setPosition(chess.fen());
  }

  async function handleAttempt(attemptSoFar: string[], priorMoves: string[]) {
    const timeTakenSecs = Math.round((Date.now() - startedAtRef.current) / 1000);
    const result = await submitPuzzleAttemptAction({
      assignmentId,
      puzzleId,
      submittedMoves: attemptSoFar,
      timeTakenSecs,
    });

    if (!result.ok) {
      setFeedback({ kind: "wrong" });
      resetToLastCorrectPosition(priorMoves);
      setBusy(false);
      return;
    }

    if (result.isCorrect) {
      setSubmittedMoves(attemptSoFar);
      setFeedback({ kind: "solved" });
      setBusy(false);
      return;
    }

    if (result.firstMismatchIndex < attemptSoFar.length) {
      // The move just played was the wrong one — revert to the last known-
      // correct position so the student can try again. It was still logged
      // above as its own PuzzleAttempt row.
      setFeedback({ kind: "wrong" });
      resetToLastCorrectPosition(priorMoves);
      setBusy(false);
      return;
    }

    // Correct so far but not done — auto-play the opponent's reply so the
    // student's next drop is their next real decision.
    const solution = solutionMoves.split(" ").filter(Boolean);
    const replyUci = solution[attemptSoFar.length];
    let nextSubmitted = attemptSoFar;
    if (replyUci) {
      chess.move({
        from: replyUci.slice(0, 2) as Square,
        to: replyUci.slice(2, 4) as Square,
        promotion: replyUci.slice(4) || undefined,
      });
      nextSubmitted = [...attemptSoFar, replyUci];
      setPosition(chess.fen());
    }
    setSubmittedMoves(nextSubmitted);
    setFeedback(null);
    setBusy(false);
  }

  function onPieceDrop(sourceSquare: Square, targetSquare: Square) {
    if (solved || busy) return false;

    const move = tryMove(chess, { from: sourceSquare, to: targetSquare, promotion: "q" });
    if (!move) return false;

    const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const attemptSoFar = [...submittedMoves, uci];
    setPosition(chess.fen());
    setBusy(true);

    void handleAttempt(attemptSoFar, submittedMoves);
    return true;
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm sm:p-6">
      <div ref={boardRef} className="mx-auto w-full max-w-[420px]">
        <Chessboard
          position={position}
          onPieceDrop={onPieceDrop}
          arePiecesDraggable={!solved && !busy}
          boardWidth={boardWidth}
        />
      </div>
      <p className="mt-3 font-mono text-sm text-slate">
        {submittedMoves.filter((_, i) => i % 2 === 0).length} of{" "}
        {Math.ceil(solutionLength / 2)} moves found
      </p>
      {feedback?.kind === "solved" && (
        <p className="mt-2 text-sm font-medium text-board-dark">Solved! Nice work.</p>
      )}
      {feedback?.kind === "wrong" && (
        <p className="mt-2 text-sm text-brick">Not quite — try again.</p>
      )}
    </div>
  );
}
