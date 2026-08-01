// Signature product motif: an 8-square checkered strip echoing one rank of a
// chessboard. Filled squares (board green, gold on the leading edge) show
// progress toward a completed set — used anywhere something is "N of a set"
// (puzzle sets, homework completion, roster fill).
export function RankProgressBar({
  completed,
  total,
  label,
}: {
  completed: number;
  total: number;
  label?: string;
}) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(Math.max(completed / safeTotal, 0), 1);
  const filledSegments = Math.round(ratio * 8);

  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-3 w-32 overflow-hidden rounded-sm border border-ink/10"
        role="img"
        aria-label={label ?? `${completed} of ${total} complete`}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const filled = i < filledSegments;
          const isLeadingEdge = filled && i === filledSegments - 1;
          const checkerDark = i % 2 === 1;
          return (
            <div
              key={i}
              className={
                filled
                  ? isLeadingEdge
                    ? "flex-1 bg-gold"
                    : "flex-1 bg-board"
                  : checkerDark
                  ? "flex-1 bg-slate-light"
                  : "flex-1 bg-white"
              }
            />
          );
        })}
      </div>
      <span className="font-mono text-xs text-slate">
        {completed}/{total}
      </span>
    </div>
  );
}
