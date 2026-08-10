"use client";

import { useEffect, useState } from "react";
import { PixelPanel } from "@/components/ui/pixel";

interface Frame {
  cmd: string;
  out?: string;
  nodes: number; // commits visible after this frame
  branch?: boolean; // second lane visible
  merged?: boolean;
}

const FRAMES: Frame[] = [
  { cmd: "git init", out: "Initialized empty Git repository", nodes: 0 },
  { cmd: 'git commit -m "First page"', out: "[main a1b2c3d] First page", nodes: 1 },
  { cmd: "git switch -c feature", out: "Switched to a new branch 'feature'", nodes: 1, branch: true },
  { cmd: 'git commit -m "New menu"', out: "[feature e4f5a6b] New menu", nodes: 2, branch: true },
  { cmd: "git merge feature", out: "Merge made by the 'ort' strategy.", nodes: 3, branch: true, merged: true },
];

const TYPE_MS = 55;
const HOLD_MS = 1400;

export function HeroDemo() {
  const [frame, setFrame] = useState(0);
  const [chars, setChars] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setFrame(FRAMES.length - 1);
      setChars(FRAMES[FRAMES.length - 1].cmd.length);
      return;
    }
    const f = FRAMES[frame];
    if (chars < f.cmd.length) {
      const t = setTimeout(() => setChars((c) => c + 1), TYPE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setFrame((x) => (x + 1) % FRAMES.length);
      setChars(0);
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [frame, chars]);

  const f = FRAMES[frame];
  const typedAll = chars >= f.cmd.length;
  const shown = FRAMES.slice(0, frame).concat(typedAll ? [f] : []);
  const visible = shown.slice(-3);
  const g = typedAll ? f : frame > 0 ? FRAMES[frame - 1] : { nodes: 0, branch: false, merged: false };

  return (
    <PixelPanel tone="phos" title="▸ This is exactly how it works" className="w-full">
      <div className="grid grid-cols-[1fr_92px] gap-2 p-3 sm:grid-cols-[1fr_120px]">
        <div className="min-h-44 font-mono text-[12.5px] leading-relaxed" aria-hidden={!reduced}>
          {visible.map((v, i) => (
            <div key={`${v.cmd}-${i}`}>
              <p className="text-fg">
                <span className="text-phos">$ </span>
                {v.cmd}
              </p>
              {v.out && <p className="text-muted">{v.out}</p>}
            </div>
          ))}
          {!typedAll && (
            <p className="text-fg">
              <span className="text-phos">$ </span>
              {f.cmd.slice(0, chars)}
              <span className="blink text-phos">▮</span>
            </p>
          )}
          {typedAll && (
            <p>
              <span className="text-phos">$ </span>
              <span className="blink text-phos">▮</span>
            </p>
          )}
        </div>
        {/* mini graph */}
        <svg viewBox="0 0 90 170" className="h-44 w-full" aria-hidden>
          {g.nodes >= 1 && <Node x={25} y={140} c="#3dff74" />}
          {g.nodes >= 2 && (
            <>
              <path d="M 25 140 L 25 105 L 60 105 L 60 90" stroke="#35e0e0" strokeWidth={2} fill="none" strokeOpacity={0.6} shapeRendering="crispEdges" />
              <Node x={60} y={90} c="#35e0e0" />
            </>
          )}
          {g.merged && (
            <>
              <path d="M 25 140 L 25 40" stroke="#3dff74" strokeWidth={2} fill="none" strokeOpacity={0.6} shapeRendering="crispEdges" />
              <path d="M 60 90 L 60 60 L 25 60 L 25 40" stroke="#35e0e0" strokeWidth={2} fill="none" strokeOpacity={0.6} shapeRendering="crispEdges" />
              <rect x={19} y={34} width={12} height={12} fill="#0a120c" stroke="#3dff74" strokeWidth={2.5} transform="rotate(45 25 40)" />
              <text x={40} y={44} fontSize={9} fill="#ffb000" fontFamily="var(--font-mono)">merge!</text>
            </>
          )}
          {g.branch && !g.merged && g.nodes >= 2 && (
            <text x={40} y={73} fontSize={9} fill="#35e0e0" fontFamily="var(--font-mono)">feature</text>
          )}
        </svg>
      </div>
    </PixelPanel>
  );
}

function Node({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <rect
      x={x - 6}
      y={y - 6}
      width={12}
      height={12}
      fill={c}
      shapeRendering="crispEdges"
      style={{ filter: `drop-shadow(0 0 4px ${c})` }}
    />
  );
}
