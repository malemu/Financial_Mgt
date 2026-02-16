"use client";

import { useMemo, useState } from "react";

type AllocationDatum = {
  asset: string;
  value: number;
  weight: number;
  color: string;
};

type AllocationPieChartProps = {
  data: AllocationDatum[];
};

const assetColorMap: Record<string, string> = {
  NVDA: "#0f6b5d",
  META: "#2b4f7a",
  BTC: "#d0813a",
  CASH: "#8a847a",
  TSLA: "#b33b2e",
};

const palette = ["#0f6b5d", "#2b4f7a", "#d0813a", "#8a847a", "#b33b2e", "#4a6c4c"];

const getColor = (asset: string, index: number) =>
  assetColorMap[asset] ?? palette[index % palette.length];

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
};

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

export default function AllocationPieChart({ data }: AllocationPieChartProps) {
  const [hovered, setHovered] = useState<AllocationDatum | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const slices = useMemo(() => {
    let angle = 0;
    return data.map((item, index) => {
      const sliceAngle = (item.weight / 100) * 360;
      const startAngle = angle;
      const endAngle = angle + sliceAngle;
      angle = endAngle;
      return {
        ...item,
        startAngle,
        endAngle,
        color: item.color || getColor(item.asset, index),
      };
    });
  }, [data]);

  return (
    <div className="relative rounded-3xl border border-[color:var(--line)] bg-white/70 p-6 shadow-[var(--shadow)]">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-[color:var(--ink)]">
          Asset Allocation
        </h3>
      </div>
      {data.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] px-4 py-6 text-xs text-[color:var(--muted)]">
          No holdings available yet.
        </div>
      ) : (
        <div className="mt-4">
          <div
            className="relative mx-auto h-[360px] w-full max-w-[380px]"
            onMouseMove={(event) => {
              const rect = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
              setHoverPos({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }}
          >
            <svg viewBox="0 0 360 360" className="h-full w-full">
              <g>
                {slices.map((slice) => {
                  const midAngle = (slice.startAngle + slice.endAngle) / 2;
                  const labelRadius = slice.weight < 4 ? 175 : 155;
                  const labelPoint = polarToCartesian(180, 180, labelRadius, midAngle);
                  const labelX = labelPoint.x.toFixed(2);
                  const labelY = labelPoint.y.toFixed(2);
                  const arc = describeArc(180, 180, 120, slice.startAngle, slice.endAngle);
                  return (
                    <g key={slice.asset}>
                      <path
                        d={`${arc} L 180 180 Z`}
                        fill={slice.color}
                        opacity={hovered && hovered.asset !== slice.asset ? 0.4 : 0.95}
                        onMouseEnter={() => setHovered(slice)}
                        onMouseLeave={() => setHovered(null)}
                      />
                      <text
                        x={labelX}
                        y={labelY}
                        textAnchor={labelPoint.x > 180 ? "start" : "end"}
                        fontSize="11"
                        fill={slice.color}
                        dominantBaseline="middle"
                      >
                        <tspan x={labelX} dy="0">
                          {slice.asset}
                        </tspan>
                        <tspan x={labelX} dy="14">
                          {slice.weight.toFixed(1)}%
                        </tspan>
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
            {hovered && (
              <div
                className="pointer-events-none absolute rounded-xl border border-[color:var(--line)] bg-white/95 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[color:var(--muted)]"
                style={{
                  left: hoverPos.x,
                  top: hoverPos.y,
                  transform: "translate(12px, -12px)",
                }}
              >
                <div className="text-[color:var(--ink)]">{hovered.asset}</div>
                <div>{formatCurrency(hovered.value)}</div>
                <div>{hovered.weight.toFixed(1)}%</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
