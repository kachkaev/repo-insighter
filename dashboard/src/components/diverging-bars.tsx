import { AxisBottom, AxisLeft } from "@visx/axis";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { useState } from "react";

import { formatCount, formatMonth } from "../format.ts";
import { Legend } from "./primitives.tsx";
import { useMeasuredWidth } from "./use-measure.ts";

const margin = { top: 8, right: 12, bottom: 24, left: 52 };
const height = 240;

/** Monthly added lines above the baseline, deleted lines below it. */
export function DivergingBars({
  points,
  positiveLabel,
  negativeLabel,
}: {
  points: Array<{ month: string; positive: number; negative: number }>;
  positiveLabel: string;
  negativeLabel: string;
}) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | undefined>();

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const dates = points.map((point) => new Date(`${point.month}-15`).getTime());

  // Bars are centred on their month, so pinning the first and last months to
  // the chart edges spills half a bar off each side. Inset the range by half a
  // month slot so every bar sits inside the plot area.
  const xInset = innerWidth / Math.max(1, points.length) / 2;

  let xMin = Math.min(...dates);
  let xMax = Math.max(...dates);
  if (xMin === xMax) {
    xMin -= 14 * 86_400_000;
    xMax += 14 * 86_400_000;
  }
  const xScale = scaleTime({
    domain: [xMin, xMax],
    range: [xInset, innerWidth - xInset],
  });

  const maxPositive = Math.max(1, ...points.map((point) => point.positive));
  const maxNegative = Math.max(1, ...points.map((point) => point.negative));
  const yScale = scaleLinear({
    domain: [-maxNegative * 1.05, maxPositive * 1.05],
    range: [innerHeight, 0],
    nice: true,
  });

  if (points.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">No data collected yet.</p>
    );
  }

  const barWidth = Math.max(
    1,
    Math.min(18, (innerWidth / Math.max(1, points.length)) * 0.7),
  );
  const hovered = hoverIndex === undefined ? undefined : points[hoverIndex];

  return (
    <div>
      <Legend
        items={[
          { label: positiveLabel, color: "var(--diverge-pos)" },
          { label: negativeLabel, color: "var(--diverge-neg)" },
        ]}
      />
      <div ref={containerRef} className="relative">
        <svg width={width} height={height} role="img">
          <Group left={margin.left} top={margin.top}>
            <GridRows
              scale={yScale}
              width={innerWidth}
              numTicks={4}
              stroke="var(--grid-line)"
            />
            {points.map((point, index) => {
              const x = xScale(dates[index] ?? 0) - barWidth / 2;
              const zero = yScale(0);
              return (
                <g
                  key={point.month}
                  opacity={
                    hoverIndex === undefined || hoverIndex === index ? 1 : 0.45
                  }
                >
                  <rect
                    x={x}
                    y={yScale(point.positive)}
                    width={barWidth}
                    height={Math.max(0, zero - yScale(point.positive))}
                    fill="var(--diverge-pos)"
                    rx={1}
                  />
                  <rect
                    x={x}
                    y={zero}
                    width={barWidth}
                    height={Math.max(0, yScale(-point.negative) - zero)}
                    fill="var(--diverge-neg)"
                    rx={1}
                  />
                </g>
              );
            })}
            <line
              x1={0}
              x2={innerWidth}
              y1={yScale(0)}
              y2={yScale(0)}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            <AxisLeft
              scale={yScale}
              numTicks={5}
              hideTicks
              stroke="var(--grid-line)"
              tickFormat={(value) => formatCount(Math.abs(Number(value)))}
              tickLabelProps={() => ({
                fill: "var(--text-muted)",
                fontSize: 10,
                fontFamily: "inherit",
                dx: -4,
                textAnchor: "end" as const,
                verticalAnchor: "middle" as const,
              })}
            />
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              numTicks={Math.min(8, Math.floor(innerWidth / 90))}
              hideTicks
              stroke="var(--grid-line)"
              tickLabelProps={() => ({
                fill: "var(--text-muted)",
                fontSize: 10,
                fontFamily: "inherit",
                textAnchor: "middle" as const,
              })}
            />
            <rect
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - bounds.left;
                let nearest = 0;
                let nearestDistance = Number.POSITIVE_INFINITY;
                for (const [index, dateMs] of dates.entries()) {
                  const distance = Math.abs(xScale(dateMs) - x);
                  if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearest = index;
                  }
                }
                setHoverIndex(nearest);
              }}
              onMouseLeave={() => {
                setHoverIndex(undefined);
              }}
            />
          </Group>
        </svg>
        {hovered !== undefined && hoverIndex !== undefined && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: Math.min(
                Math.max(0, margin.left + xScale(dates[hoverIndex] ?? 0) + 10),
                Math.max(0, width - 170),
              ),
            }}
          >
            <div className="mb-1 font-medium text-(--text-secondary)">
              {formatMonth(hovered.month)}
            </div>
            <div>
              {positiveLabel}:{" "}
              <span className="font-medium tabular-nums">
                +{formatCount(hovered.positive)}
              </span>
            </div>
            <div>
              {negativeLabel}:{" "}
              <span className="font-medium tabular-nums">
                −{formatCount(hovered.negative)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
