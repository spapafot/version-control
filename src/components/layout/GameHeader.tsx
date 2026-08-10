"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useProgress } from "@/lib/progress";
import { ALL_CHALLENGES } from "@/challenges";
import { HudLabel, PixelProgress } from "@/components/ui/pixel";

export function GameHeader({ right }: { right?: React.ReactNode }) {
  const soundOn = useProgress((s) => s.soundOn);
  const crtOn = useProgress((s) => s.crtOn);
  const toggleSound = useProgress((s) => s.toggleSound);
  const toggleCrt = useProgress((s) => s.toggleCrt);
  const completed = useProgress((s) => s.completed);

  useEffect(() => {
    document.documentElement.dataset.crt = crtOn ? "on" : "off";
  }, [crtOn]);

  const done = Object.keys(completed).filter((slug) =>
    ALL_CHALLENGES.some((c) => c.id === slug),
  ).length;

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-line bg-panel px-4 py-2.5">
      <Link prefetch={false} href="/" className="hud glow-text text-sm text-phos">
        ▚ VersionControl.gr
      </Link>
      <div className="flex min-w-28 flex-1 items-center gap-2">
        <PixelProgress value={done / ALL_CHALLENGES.length} segments={15} className="max-w-56 flex-1" />
        <HudLabel tone="line">
          {done}/{ALL_CHALLENGES.length}
        </HudLabel>
      </div>
      {right}
      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleSound}
          className={`hud border px-2 py-1 text-[10px] ${soundOn ? "border-phos-dim text-phos" : "border-line text-muted"}`}
          aria-pressed={soundOn}
          title={soundOn ? "Turn off sound" : "Turn on sound"}
        >
          {soundOn ? "♪ on" : "♪ off"}
        </button>
        <button
          onClick={toggleCrt}
          className={`hud border px-2 py-1 text-[10px] ${crtOn ? "border-phos-dim text-phos" : "border-line text-muted"}`}
          aria-pressed={crtOn}
          title="CRT screen effect"
        >
          crt
        </button>
      </div>
    </header>
  );
}
