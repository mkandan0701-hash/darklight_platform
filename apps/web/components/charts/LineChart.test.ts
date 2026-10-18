import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LineChart } from "./LineChart";
import type { ChartPoint } from "../../lib/metrics";

// Rendered rather than inspected as props: the chart's whole job is arithmetic
// that ends up inside an attribute string, and a divide-by-zero there produces
// `points="NaN,NaN"` — an SVG that renders blank with no error anywhere. The
// file is .test.ts, not .tsx, because the Vitest include glob is **/*.test.ts;
// createElement avoids needing JSX.
function render(props: Parameters<typeof LineChart>[0]): string {
  return renderToStaticMarkup(createElement(LineChart, props));
}

const point = (label: string, value: number): ChartPoint => ({ label, value });

describe("coordinate maths", () => {
  it("never emits NaN, for any shape of input", () => {
    const cases: ChartPoint[][] = [
      [point("Mon", 0)],
      [point("Mon", 0), point("Tue", 0), point("Wed", 0)],
      [point("Mon", 5), point("Tue", 0)],
      Array.from({ length: 12 }, (_, i) => point(`M${i}`, i)),
    ];
    for (const points of cases) {
      const html = render({ points, ariaLabel: "test" });
      expect(html, JSON.stringify(points)).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
      expect(html).not.toContain("undefined");
    }
  });

  // Every value is zero, so the series has no range to scale against. Without
  // a floor the divisor is zero and every coordinate becomes NaN.
  it("still plots a flat line when nothing happened all week", () => {
    const html = render({
      points: [point("Mon", 0), point("Tue", 0), point("Wed", 0)],
      ariaLabel: "flat",
    });
    // All three points sit on the baseline, 100% down the box.
    expect(html).toContain("0,100 50,100 100,100");
    // And the axis still shows a scale to read it against.
    expect(html).toContain(">1<");
  });

  // Dividing by points.length - 1 is zero for a single point.
  it("centres a lone point instead of dividing by zero", () => {
    const html = render({ points: [point("Mon", 3)], ariaLabel: "one" });
    expect(html).toContain("50,0");
    expect(html).not.toContain("NaN");
  });

  it("puts the first and last points at the edges of the plot", () => {
    const html = render({
      points: [point("Mon", 0), point("Tue", 2), point("Wed", 1)],
      ariaLabel: "three",
    });
    expect(html).toMatch(/points="0,\d+(\.\d+)? .* 100,\d+/);
  });

  it("scales a percentage series against 100, not against its own peak", () => {
    const html = render({
      points: [point("W1", 50)],
      unit: "%",
      maxOverride: 100,
      ariaLabel: "rate",
    });
    // 50 of 100 sits halfway down, not at the top.
    expect(html).toContain("50,50");
    expect(html).toContain("100%");
  });
});

describe("missing data is not zero", () => {
  // The distinction the whole chart exists to preserve. A week nobody took a
  // register in is not a week nobody attended; plotting it at zero draws a
  // collapse in attendance that never happened.
  it("breaks the line across a gap instead of dropping to the floor", () => {
    const html = render({
      points: [point("W1", 80), { label: "W2", value: null }, point("W3", 90)],
      unit: "%",
      maxOverride: 100,
      ariaLabel: "gappy",
    });
    // Two separate line segments, not one continuous line through zero.
    expect(html.match(/<polyline/g)).toHaveLength(2);
    expect(html).not.toContain("50,100");
  });

  it("draws no point where there is no measurement", () => {
    const html = render({
      points: [point("W1", 80), { label: "W2", value: null }],
      unit: "%",
      ariaLabel: "gappy",
    });
    expect(html).toContain('title="W1: 80%"');
    expect(html).not.toContain("W2:");
  });

  it("still plots a genuine zero as a point on the floor", () => {
    const html = render({ points: [point("Mon", 0), point("Tue", 4)], ariaLabel: "real zero" });
    expect(html).toContain('title="Mon: 0"');
    expect(html.match(/<polyline/g)).toHaveLength(1);
  });

  it("ignores gaps when choosing the scale", () => {
    const html = render({
      points: [{ label: "a", value: null }, point("b", 4)],
      ariaLabel: "scale",
    });
    expect(html).not.toContain("NaN");
    expect(html).toContain(">4<");
  });
});

describe("empty and accessible", () => {
  it("says so rather than drawing an empty axis", () => {
    const html = render({ points: [], ariaLabel: "nothing" });
    expect(html).toContain("Nothing to chart");
    expect(html).not.toContain("<svg");
  });

  it("labels the plot for a screen reader, since it is one image to them", () => {
    const html = render({ points: [point("Mon", 1)], ariaLabel: "New students by day" });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="New students by day"');
  });

  it("gives every point a hover readout with its own value", () => {
    const html = render({ points: [point("Mon", 4), point("Tue", 7)], ariaLabel: "x" });
    expect(html).toContain('title="Mon: 4"');
    expect(html).toContain('title="Tue: 7"');
  });

  // preserveAspectRatio="none" stretches the box to fill any width, which
  // would smear the strokes with it without this.
  it("keeps strokes un-stretched when the plot is stretched", () => {
    const html = render({ points: [point("Mon", 1)], ariaLabel: "x" });
    expect(html).toContain('preserveAspectRatio="none"');
    expect(html).toContain('vector-effect="non-scaling-stroke"');
  });
});
