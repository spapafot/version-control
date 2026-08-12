"use client";

import { useEffect, useRef, useState } from "react";
import { HudLabel } from "@/components/ui/pixel";
import { formatElapsed } from "@/lib/quiz-api";
import { remainingMs, useQuiz } from "@/lib/quiz-store";

/** Below this the countdown turns amber, then red, to be felt not read. */
const WARN_MS = 30_000;
const URGENT_MS = 10_000;

/**
 * Countdown for the current run, driven by the server's deadline.
 *
 * Ticks four times a second so the seconds digit never appears to stall, and
 * calls finish() itself when it reaches zero: the run ends on the clock whether
 * or not the player is still looking at the tab.
 */
export function QuizTimer() {
  const expiresAtMs = useQuiz((s) => s.expiresAtMs);
  const clockOffsetMs = useQuiz((s) => s.clockOffsetMs);
  const phase = useQuiz((s) => s.phase);
  const finish = useQuiz((s) => s.finish);

  const [left, setLeft] = useState(() => remainingMs({ expiresAtMs, clockOffsetMs }));
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    const tick = () => {
      const value = remainingMs({ expiresAtMs, clockOffsetMs });
      setLeft(value);
      if (value <= 0 && !fired.current) {
        fired.current = true;
        void finish();
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [expiresAtMs, clockOffsetMs, finish]);

  const tone = left <= URGENT_MS ? "red" : left <= WARN_MS ? "amber" : "phos";
  const running = phase === "running";

  return (
    <span className="flex items-center gap-2">
      <HudLabel tone="line">Time</HudLabel>
      <span
        className={`hud text-sm ${
          tone === "red"
            ? "text-crt-red"
            : tone === "amber"
              ? "glow-text-amber text-amber"
              : "glow-text text-phos"
        } ${running && left <= URGENT_MS ? "blink" : ""}`}
      >
        {formatElapsed(left)}
      </span>
      {/*
        Announced at the two thresholds rather than every tick: a live region
        that reads out every second makes the run unusable with a screen reader.
      */}
      <span className="sr-only" role="status" aria-live="polite">
        {running && left <= URGENT_MS
          ? "Ten seconds left"
          : running && left <= WARN_MS
            ? "Thirty seconds left"
            : ""}
      </span>
    </span>
  );
}
