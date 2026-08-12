"use client";

import { useEffect, useState } from "react";
import { HudLabel, PixelPanel } from "@/components/ui/pixel";
import {
  fetchLeaderboard,
  formatElapsed,
  MODE_LABELS,
  QUIZ_MODES,
  type Leaderboard,
  type QuizMode,
  type QuizPeriod,
} from "@/lib/quiz-api";

const PERIODS: { value: QuizPeriod; label: string }[] = [
  { value: "ALL", label: "All time" },
  { value: "WEEK", label: "This week" },
];

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`hud border px-2.5 py-1 text-[10px] ${
        active
          ? "border-phos-dim bg-raised text-phos"
          : "border-line text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function QuizLeaderboard({
  selectedMode = "set20",
  /** bumped after every finished run, to force a fetch past the browser cache */
  refreshToken = 0,
}: {
  selectedMode?: QuizMode;
  refreshToken?: number;
}) {
  const [mode, setMode] = useState<QuizMode>(selectedMode);
  const [period, setPeriod] = useState<QuizPeriod>("ALL");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Follow the mode picked on the hub. Without this the prop only seeds the
  // initial state, so choosing Sprint upstairs left the Set of 20 board sitting
  // underneath it. The tabs below still override, which is why this is a sync
  // rather than the board being fully controlled.
  useEffect(() => {
    setMode(selectedMode);
  }, [selectedMode]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // refreshToken > 0 means a run just finished, so bypass the cached copy;
    // idle tab switches keep using it.
    fetchLeaderboard(mode, period, 25, refreshToken > 0)
      .then((data) => {
        if (!cancelled) setBoard(data);
      })
      .catch(() => {
        if (!cancelled) setError("The leaderboard could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      // A fast tab switch must not let a slow earlier response overwrite the
      // board the player is now looking at.
      cancelled = true;
    };
  }, [mode, period, refreshToken]);

  const rows = board?.rows ?? [];
  // Every sprint runs the full three minutes, so a Time column would be the
  // same value repeated down the page.
  const showTime = mode !== "sprint";

  return (
    <PixelPanel
      tone="amber"
      title="▪ Leaderboard"
      titleAs="h2"
      actions={
        <div className="flex flex-wrap items-center gap-1">
          {QUIZ_MODES.map((m) => (
            <Tab key={m} active={m === mode} onClick={() => setMode(m)}>
              {MODE_LABELS[m]}
            </Tab>
          ))}
          <span className="mx-1 h-3 w-px bg-line" />
          {PERIODS.map((p) => (
            <Tab
              key={p.value}
              active={p.value === period}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Tab>
          ))}
        </div>
      }
    >
      <div className="p-4">
        {loading && <HudLabel cursor tone="line">Loading</HudLabel>}
        {!loading && error !== null && <p className="text-sm text-crt-red">{error}</p>}
        {!loading && error === null && rows.length === 0 && (
          <p className="text-sm text-muted">
            Nobody has posted a score here yet.
          </p>
        )}
        {!loading && error === null && rows.length > 0 && (
          // Wide content scrolls inside its own box rather than the page.
          <div className="overflow-x-auto">
            <table className="w-full min-w-md border-collapse text-sm">
              <caption className="sr-only">
                {MODE_LABELS[mode]} leaderboard, {period === "ALL" ? "all time" : "this week"}
              </caption>
              <thead>
                <tr className="hud border-b border-line text-left text-[10px] text-muted">
                  <th scope="col" className="py-1.5 pr-3 font-normal">#</th>
                  <th scope="col" className="py-1.5 pr-3 font-normal">Player</th>
                  <th scope="col" className={`py-1.5 text-right font-normal ${showTime ? "pr-3" : ""}`}>
                    Score
                  </th>
                  {showTime && (
                    <th scope="col" className="py-1.5 text-right font-normal">Time</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.rank}-${row.name}`} className="border-b border-line/50 last:border-0">
                    <td className="hud py-1.5 pr-3 text-[11px] text-amber">{row.rank}</td>
                    <td className="max-w-48 truncate py-1.5 pr-3 text-fg">{row.name}</td>
                    <td className={`py-1.5 text-right font-mono text-phos ${showTime ? "pr-3" : ""}`}>
                      {row.score}
                      {/* A sprint total is the pool dealt, not a target, so a
                          denominator there would be meaningless. */}
                      {showTime && <span className="text-muted">/{row.total}</span>}
                    </td>
                    {showTime && (
                      <td className="py-1.5 text-right font-mono text-muted">
                        {formatElapsed(row.elapsedMs)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PixelPanel>
  );
}
