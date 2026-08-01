import { AnalysisBoard } from "./AnalysisBoard";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

// Like /dashboard/play: no requireRole — everyone in an academy can analyse.
// Auth and tenant resolution are enforced by app/(dashboard)/layout.tsx.
export default function AnalysisPage() {
  return (
    <div>
      <h1 className={pageHeadingClass}>Analysis board</h1>
      <p className="mt-1 text-sm text-slate">
        Paste a game or a position, or just play moves on the board. The engine runs in
        your browser — nothing is uploaded, and nothing is saved.
      </p>

      <div className="mt-6">
        <AnalysisBoard />
      </div>

      <p className="mt-8 text-xs text-slate">
        Chess engine:{" "}
        <a
          href="https://github.com/nmrugg/stockfish.js"
          target="_blank"
          rel="noreferrer noopener"
          className={textLinkClass}
        >
          Stockfish 18
        </a>{" "}
        — free software under the{" "}
        <a href="/engine/COPYING.txt" className={textLinkClass}>
          GPL-3.0
        </a>
        , used unmodified.
      </p>
    </div>
  );
}
