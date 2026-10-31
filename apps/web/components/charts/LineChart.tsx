// Next compiles JSX with the automatic runtime, which needs no import — but
// Vitest's esbuild uses the classic transform, so rendering this component in
// a test fails with "React is not defined" without it. Same reason
// lib/pdf/certificateTemplates.tsx carries one.
import React from "react";
import type { ChartPoint } from "../../lib/metrics";
import { BOARD, SLATE_LIGHT } from "../art/palette";

// A small line chart, server-rendered, zero JavaScript.
//
// No chart library: two line charts do not justify the client bundle one
// brings, and StaticBoard.tsx already set this precedent in writing for the
// same reason. Native <title> gives the hover readout that a tooltip layer
// would otherwise cost a few hundred kilobytes to provide.
//
// Responsiveness is split deliberately. The plot is an SVG stretched with
// preserveAspectRatio="none" over a 0–100 box, so it fills any width; the
// strokes carry vector-effect="non-scaling-stroke" so that stretch does not
// smear them. Everything a person reads — axis labels, data points — is HTML
// positioned over the top in percentages, so type stays at its intended size
// on a phone and dots stay circular instead of turning into ellipses.

export interface LineChartProps {
  points: ChartPoint[];
  /** Appended to every readable value: "%" for a rate, "" for a count. */
  unit?: string;
  /** Describes the series for screen readers — the chart is one image to them. */
  ariaLabel: string;
  /** Fixed, because a line chart with no vertical room reads as a flat line. */
  height?: number;
  /** Forces the top of the scale, e.g. 100 for a percentage. */
  maxOverride?: number;
}

/** Nice round ceiling so the top gridline is a number a person would pick. */
function axisMax(values: (number | null)[], maxOverride?: number): number {
  if (maxOverride !== undefined) return maxOverride;
  const peak = Math.max(0, ...values.filter((v): v is number => v !== null));
  // A series of all zeros still needs a scale, or every point divides by zero.
  // One is also what makes an empty week read as a real floor rather than a
  // chart that failed to draw.
  if (peak <= 1) return 1;
  if (peak <= 5) return peak;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  return Math.ceil(peak / magnitude) * magnitude;
}

function ticksFor(max: number): number[] {
  if (max <= 1) return [0, 1];
  if (max <= 4) return Array.from({ length: max + 1 }, (_, i) => i);
  return [0, max / 2, max];
}

export function LineChart({
  points,
  unit = "",
  ariaLabel,
  height = 220,
  maxOverride,
}: LineChartProps) {
  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate">Nothing to chart for this period yet.</p>
    );
  }

  const max = axisMax(
    points.map((p) => p.value),
    maxOverride
  );
  const ticks = ticksFor(max);

  // A single point has no span to divide by; park it in the middle rather than
  // dividing by zero.
  const xOf = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  const yOf = (value: number) => 100 - (value / max) * 100;

  // Split into runs of consecutive real values, so a gap in the data leaves a
  // gap in the line rather than a plunge to the floor and back.
  const segments: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length > 0) segments.push(run.join(" "));
      run = [];
      return;
    }
    run.push(`${xOf(i)},${yOf(p.value)}`);
  });
  if (run.length > 0) segments.push(run.join(" "));

  return (
    <figure className="m-0">
      <div className="flex gap-2">
        {/* Y axis: HTML, so the numbers do not stretch with the plot. */}
        <div
          className="relative w-7 shrink-0 font-mono text-[10px] text-slate"
          style={{ height }}
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 tabular-nums"
              style={{ top: `${yOf(t)}%` }}
            >
              {Math.round(t)}
              {unit}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1" style={{ height }}>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={ariaLabel}
          >
            {ticks.map((t) => (
              <line
                key={`h${t}`}
                x1="0"
                x2="100"
                y1={yOf(t)}
                y2={yOf(t)}
                stroke={SLATE_LIGHT}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {points.map((p, i) => (
              <line
                key={`v${p.label}-${i}`}
                x1={xOf(i)}
                x2={xOf(i)}
                y1="0"
                y2="100"
                stroke={SLATE_LIGHT}
                strokeWidth="1"
                strokeDasharray="2 3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {segments.map((segment, i) => (
              <polyline
                key={`seg${i}`}
                points={segment}
                fill="none"
                stroke={BOARD}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Points as HTML: perfect circles at any width, and a native
              tooltip per point without a millisecond of JavaScript. */}
          {points.map((p, i) =>
            p.value === null ? null : (
              <span
                key={`${p.label}-${i}`}
                title={`${p.label}: ${p.value}${unit}`}
                className="absolute block h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-board"
                style={{ left: `${xOf(i)}%`, top: `${yOf(p.value)}%` }}
              />
            )
          )}
        </div>
      </div>

      {/* X axis. justify-between puts the first and last ticks flush with the
          ends of the plot, where their points sit. */}
      <div className="ml-9 mt-2 flex justify-between font-mono text-[10px] text-slate">
        {points.map((p, i) => (
          <span key={`${p.label}-${i}`} className="truncate">
            {p.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
