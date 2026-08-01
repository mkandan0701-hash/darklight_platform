import { PlayVsEngineBoard } from "./PlayVsEngineBoard";
import { pageHeadingClass, textLinkClass } from "../../../../components/ui/styles";

// No requireRole: everyone in an academy can play, parents included. Auth and
// tenant resolution are already enforced by app/(dashboard)/layout.tsx.
export default function PlayPage() {
  return (
    <div>
      <h1 className={pageHeadingClass}>Play the computer</h1>
      <p className="mt-1 text-sm text-slate">
        Six strength levels, from a forgiving first game to full strength. The engine
        runs in your browser — nothing is sent to a server.
      </p>

      <div className="mt-6">
        <PlayVsEngineBoard />
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
