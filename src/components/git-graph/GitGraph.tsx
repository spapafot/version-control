"use client";

import { useMemo } from "react";
import { useGame } from "@/lib/game-store";
import { layoutGraph } from "@/git/graph";
import { HudLabel } from "@/components/ui/pixel";

const LANE_COLORS = ["#3dff74", "#35e0e0", "#ff5ca8", "#ffb000", "#8affb0", "#7fecec"];
const LANE_W = 34;
const ROW_H = 46;
const PAD_X = 22;
const PAD_Y = 26;
const NODE = 12; // pixel-square commit size

/**
 * The phosphor circuit: commits as glowing pixel squares on colored lanes,
 * right-angle traces between them, branch tags and a blinking HEAD.
 */
export function GitGraph() {
  const state = useGame((s) => s.state);

  const layout = useMemo(
    () => (state && state.commits.length > 0 ? layoutGraph(state.commits) : null),
    [state],
  );

  if (!state || !layout) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="font-mono text-3xl text-line" aria-hidden>
          ●─●─●
        </span>
        <HudLabel tone="line" cursor>
          No commits yet
        </HudLabel>
        <p className="max-w-[22ch] text-xs text-muted">
          Your first commit will show up here.
        </p>
      </div>
    );
  }

  const graphW = PAD_X * 2 + (layout.laneCount - 1) * LANE_W + NODE;
  const height = PAD_Y * 2 + Math.max(0, layout.rowCount - 1) * ROW_H + NODE;
  const cx = (lane: number) => PAD_X + lane * LANE_W;
  const cy = (row: number) => PAD_Y + row * ROW_H;
  const color = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length];

  return (
    <div className="h-full overflow-auto">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 560 ${height}`}
        preserveAspectRatio="xMinYMin meet"
        role="img"
        aria-label={`Git graph with ${state.commits.length} commits`}
        className="min-w-[320px]"
      >
        {/* traces */}
        {layout.edges.map((e, i) => {
          const x1 = cx(e.child.lane);
          const y1 = cy(e.child.row);
          const x2 = cx(e.parent.lane);
          const y2 = cy(e.parent.row);
          const c = color(x1 === x2 ? e.child.lane : e.parent.lane);
          const d =
            x1 === x2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} L ${x1} ${y2 - ROW_H / 2} L ${x2} ${y2 - ROW_H / 2} L ${x2} ${y2}`;
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={c}
              strokeWidth={2}
              strokeOpacity={0.55}
              shapeRendering="crispEdges"
            />
          );
        })}

        {/* commit nodes + inline decorations: [tags] message · hash */}
        {layout.nodes.map((n) => {
          const x = cx(n.lane);
          const y = cy(n.row);
          const c = color(n.lane);
          const isHead = state.head.oid === n.commit.oid;
          const half = NODE / 2;
          const labelX = PAD_X + (layout.laneCount - 1) * LANE_W + 26;

          const refs = [...n.commit.refs].sort((a, b) => {
            const ah = isHead && state.head.ref === a ? -1 : 0;
            const bh = isHead && state.head.ref === b ? -1 : 0;
            return ah - bh;
          });
          const tagDefs = [
            // detached HEAD: no branch carries the marker, so it stands alone
            ...(isHead && state.head.ref === null
              ? [{ key: "@detached", label: "HEAD", hot: true }]
              : []),
            ...refs.map((ref) => {
              const isHeadRef = isHead && state.head.ref === ref;
              return { key: ref, label: isHeadRef ? `HEAD → ${ref}` : ref, hot: isHeadRef };
            }),
          ];
          let tx = labelX;
          const tags = tagDefs.map(({ key, label, hot }) => {
            const w = label.length * 6.4 + 12;
            const el = (
              <g key={key}>
                <rect
                  x={tx}
                  y={y - 9}
                  width={w}
                  height={17}
                  fill="#0f1a11"
                  stroke={hot ? "#ffb000" : c}
                  strokeWidth={1.5}
                  shapeRendering="crispEdges"
                />
                <text
                  x={tx + 6}
                  y={y + 3.5}
                  fontSize={10.5}
                  fontFamily="var(--font-mono)"
                  fill={hot ? "#ffb000" : c}
                >
                  {label}
                </text>
              </g>
            );
            tx += w + 6;
            return el;
          });

          return (
            <g key={n.commit.oid}>
              {n.commit.isMerge ? (
                <rect
                  x={x - half}
                  y={y - half}
                  width={NODE}
                  height={NODE}
                  fill="#0a120c"
                  stroke={c}
                  strokeWidth={3}
                  transform={`rotate(45 ${x} ${y})`}
                  shapeRendering="auto"
                />
              ) : (
                <rect
                  x={x - half}
                  y={y - half}
                  width={NODE}
                  height={NODE}
                  fill={c}
                  shapeRendering="crispEdges"
                  style={{ filter: `drop-shadow(0 0 4px ${c})` }}
                />
              )}
              {isHead && (
                <rect
                  x={x - half - 4}
                  y={y - half - 4}
                  width={NODE + 8}
                  height={NODE + 8}
                  fill="none"
                  stroke="#ffb000"
                  strokeWidth={1.5}
                  shapeRendering="crispEdges"
                  className="blink"
                />
              )}
              {tags}
              <text x={tx + 2} y={y + 4} fontSize={12} fontFamily="var(--font-mono)">
                <tspan fill="#c9e8ce">
                  {n.commit.isMerge ? "⧉ " : ""}
                  {truncate(n.commit.message.split("\n")[0], Math.max(10, 46 - Math.round((tx - labelX) / 7)))}
                </tspan>
                <tspan fill="#7ea98a" dx={8} fontSize={10.5}>
                  {n.commit.oid.slice(0, 7)}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
