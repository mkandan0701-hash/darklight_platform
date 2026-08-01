"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chessboard } from "react-chessboard";
import { importPgnPuzzlesAction, previewPgnPuzzlesAction } from "./actions";
import type { ParsedPuzzle, PuzzleParseError } from "../../../../lib/puzzles/parsePgnPuzzles";
import { cardClass } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { sectionHeadingClass } from "../../../../components/ui/styles";

export function PuzzleUploadForm() {
  const [preview, setPreview] = useState<{
    puzzles: ParsedPuzzle[];
    errors: PuzzleParseError[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleFileChange() {
    setError(null);
    setImportedCount(null);
    setPreview(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.set("pgnFile", file);

    startTransition(async () => {
      const result = await previewPgnPuzzlesAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview({ puzzles: result.puzzles, errors: result.errors });
    });
  }

  function handleImport() {
    if (!preview || preview.puzzles.length === 0) return;
    setError(null);

    startTransition(async () => {
      const result = await importPgnPuzzlesAction(preview.puzzles);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setImportedCount(result.imported);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className={cardClass}>
      <h2 className={sectionHeadingClass}>Upload puzzles from a PGN file</h2>
      <p className="mt-1 text-sm text-slate">
        Each puzzle is one game in the file with a starting position (a{" "}
        <code className="rounded bg-parchment px-1 font-mono">[FEN &quot;...&quot;]</code> tag) and
        the solution as the game&apos;s moves. Most chess software (ChessBase, Lichess studies) can
        export puzzle sets in this format. A file can contain many puzzles at once.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pgn,text/plain"
        onChange={handleFileChange}
        disabled={pending}
        className="mt-3 text-sm text-ink file:mr-3 file:rounded-lg file:border-0 file:bg-board-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-board-dark hover:file:bg-board/20"
      />

      {pending && <p className="mt-3 text-sm text-slate">Working…</p>}
      {error && <p className="mt-3 text-sm text-brick">{error}</p>}
      {importedCount !== null && (
        <p className="mt-3 text-sm font-medium text-board-dark">
          Imported {importedCount} puzzle{importedCount === 1 ? "" : "s"} into your library.
        </p>
      )}

      {preview && (
        <div className="mt-4">
          <p className="text-sm text-ink">
            Found {preview.puzzles.length} usable puzzle{preview.puzzles.length === 1 ? "" : "s"}
            {preview.errors.length > 0 &&
              ` — ${preview.errors.length} game${preview.errors.length === 1 ? "" : "s"} couldn't be read`}
            .
          </p>

          {preview.errors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-brick">
              {preview.errors.map((issue, i) => (
                <li key={i}>
                  Game {issue.gameIndex}: {issue.message}
                </li>
              ))}
            </ul>
          )}

          {preview.puzzles.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap gap-4">
                {preview.puzzles.map((puzzle, i) => (
                  <div key={i} className="w-40">
                    <div style={{ width: 160 }}>
                      <Chessboard
                        position={puzzle.fen}
                        arePiecesDraggable={false}
                        boardWidth={160}
                      />
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate">
                      {puzzle.moves.split(" ").length} move
                      {puzzle.moves.split(" ").length === 1 ? "" : "s"}
                    </p>
                  </div>
                ))}
              </div>

              <Button type="button" onClick={handleImport} disabled={pending} className="mt-4">
                {pending ? "Importing…" : `Import ${preview.puzzles.length} puzzles`}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
