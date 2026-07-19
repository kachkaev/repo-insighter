import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { GridRows } from "@visx/grid";
import { Group } from "@visx/group";
import { scaleLinear, scaleTime } from "@visx/scale";
import { AreaStack, BarStack, LinePath } from "@visx/shape";
import { bisector } from "d3-array";
import { useMemo, useState } from "react";

import { formatCount, formatDate } from "../format.ts";
import { Legend } from "./primitives.tsx";
import { useMeasuredWidth } from "./use-measure.ts";

export type TimePoint = {
  dateMs: number;
  values: Record<string, number>;
};

const margin = { top: 8, right: 12, bottom: 24, left: 44 };
const height = 260;

const axisTickLabelProps = {
  fill: "var(--text-muted)",
  fontSize: 10,
  fontFamily: "inherit",
} as const;

/**
 * Stacked series over time — areas for dense series, bars for monthly buckets,
 * lines for non-stacked comparison. Crosshair tooltip on hover.
 */
export function TimeSeriesChart({
  points,
  seriesKeys,
  colors,
  mode,
  valueFormat = formatCount,
}: {
  points: TimePoint[];
  seriesKeys: string[];
  colors: string[];
  mode: "area" | "bar" | "line";
  valueFormat?: (value: number) => string;
}) {
  const [containerRef, width] = useMeasuredWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | undefined>();

  const rows = useMemo(
    () =>
      points.map((point) => {
        const row: Record<string, number> = { dateMs: point.dateMs };
        for (const key of seriesKeys) {
          row[key] = point.values[key] ?? 0;
        }
        return row;
      }),
    [points, seriesKeys],
  );

  const innerWidth = Math.max(10, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(() => {
    const dates = rows.map((row) => row["dateMs"] ?? 0);
    let min = Math.min(...dates);
    let max = Math.max(...dates);
    if (min === max) {
      // A single point collapses the time scale; pad it by two weeks.
      min -= 14 * 86_400_000;
      max += 14 * 86_400_000;
    }
    return scaleTime({ domain: [min, max], range: [0, innerWidth] });
  }, [rows, innerWidth]);

  const yMax = useMemo(() => {
    let max = 0;
    for (const row of rows) {
      const total =
        mode === "line"
          ? Math.max(...seriesKeys.map((key) => row[key] ?? 0))
          : seriesKeys.reduce((sum, key) => sum + (row[key] ?? 0), 0);
      max = Math.max(max, total);
    }
    return max || 1;
  }, [rows, seriesKeys, mode]);

  const yScale = useMemo(
    () =>
      scaleLinear({
        domain: [0, yMax * 1.05],
        range: [innerHeight, 0],
        nice: true,
      }),
    [yMax, innerHeight],
  );

  const bisectDate = useMemo(
    () => bisector<Record<string, number>, number>((row) => row["dateMs"] ?? 0),
    [],
  );

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const dateMs = xScale.invert(x).getTime();
    const index = bisectDate.center(rows, dateMs);
    setHoverIndex(Math.max(0, Math.min(rows.length - 1, index)));
  };

  const hovered = hoverIndex === undefined ? undefined : rows[hoverIndex];
  const barWidth = Math.max(
    1,
    Math.min(24, (innerWidth / Math.max(1, rows.length)) * 0.8),
  );

  if (points.length === 0) {
    return (
      <p className="text-sm text-(--text-muted)">No data collected yet.</p>
    );
  }

  return (
    <div>
      <Legend
        items={seriesKeys.map((key, index) => ({
          label: key,
          color: colors[index] ?? "var(--series-1)",
        }))}
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
            {mode === "area" && (
              <AreaStack
                data={rows}
                keys={seriesKeys}
                x={(datum) => xScale(datum.data["dateMs"] ?? 0)}
                y0={(datum) => yScale(datum[0])}
                y1={(datum) => yScale(datum[1])}
                curve={curveMonotoneX}
              >
                {({ stacks, path }) =>
                  stacks.map((stack) => (
                    <path
                      key={stack.key}
                      d={path(stack) ?? ""}
                      fill={colors[seriesKeys.indexOf(stack.key)]}
                      stroke="var(--surface-1)"
                      strokeWidth={1}
                    />
                  ))
                }
              </AreaStack>
            )}
            {mode === "bar" && (
              <BarStack
                data={rows}
                keys={seriesKeys}
                x={(datum) => datum["dateMs"] ?? 0}
                xScale={xScale}
                yScale={yScale}
                color={(key) => colors[seriesKeys.indexOf(key)] ?? ""}
              >
                {(barStacks) =>
                  barStacks.map((barStack) =>
                    barStack.bars.map((bar) => (
                      <rect
                        key={`${barStack.index}-${bar.index}`}
                        x={bar.x + bar.width / 2 - barWidth / 2}
                        y={bar.y}
                        width={barWidth}
                        height={Math.max(0, bar.height)}
                        fill={bar.color}
                        stroke="var(--surface-1)"
                        strokeWidth={1}
                        rx={1}
                      />
                    )),
                  )
                }
              </BarStack>
            )}
            {mode === "line" &&
              seriesKeys.map((key, index) => (
                <LinePath
                  key={key}
                  data={rows}
                  x={(datum) => xScale(datum["dateMs"] ?? 0)}
                  y={(datum) => yScale(datum[key] ?? 0)}
                  stroke={colors[index]}
                  strokeWidth={2}
                  curve={curveMonotoneX}
                />
              ))}
            {/* A single snapshot can't draw an area/line — show dot markers. */}
            {rows.length === 1 &&
              mode !== "bar" &&
              seriesKeys.map((key, index) => {
                let stackBase = 0;
                if (mode === "area") {
                  for (const priorKey of seriesKeys.slice(0, index)) {
                    stackBase += rows[0]?.[priorKey] ?? 0;
                  }
                }
                const value = (rows[0]?.[key] ?? 0) + stackBase;
                return (
                  <circle
                    key={key}
                    cx={xScale(rows[0]?.["dateMs"] ?? 0)}
                    cy={yScale(value)}
                    r={4}
                    fill={colors[index]}
                    stroke="var(--surface-1)"
                    strokeWidth={1}
                  />
                );
              })}
            {hovered !== undefined && (
              <line
                x1={xScale(hovered["dateMs"] ?? 0)}
                x2={xScale(hovered["dateMs"] ?? 0)}
                y1={0}
                y2={innerHeight}
                stroke="var(--text-muted)"
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
            )}
            <AxisLeft
              scale={yScale}
              numTicks={4}
              hideTicks
              stroke="var(--grid-line)"
              tickFormat={(value) => formatCount(Number(value))}
              tickLabelProps={() => ({
                ...axisTickLabelProps,
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
                ...axisTickLabelProps,
                textAnchor: "middle" as const,
              })}
            />
            <rect
              width={innerWidth}
              height={innerHeight}
              fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={() => {
                setHoverIndex(undefined);
              }}
            />
          </Group>
        </svg>
        {hovered !== undefined && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-(--grid-line) bg-(--surface-2) px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: Math.min(
                Math.max(0, margin.left + xScale(hovered["dateMs"] ?? 0) + 10),
                Math.max(0, width - 180),
              ),
            }}
          >
            <div className="mb-1 font-medium text-(--text-secondary)">
              {formatDate(new Date(hovered["dateMs"] ?? 0).toISOString())}
            </div>
            {seriesKeys
              .map((key, index) => ({ key, index, value: hovered[key] ?? 0 }))
              .filter((entry) => entry.value !== 0 || seriesKeys.length <= 3)
              .slice(0, 10)
              .map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-xs"
                    style={{ background: colors[entry.index] }}
                  />
                  <span className="text-(--text-secondary)">{entry.key}</span>
                  <span className="ml-auto pl-3 font-medium tabular-nums">
                    {valueFormat(entry.value)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
