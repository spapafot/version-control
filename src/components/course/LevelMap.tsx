"use client";

import Link from "next/link";
import { useProgress } from "@/lib/progress";
import {
  ACHIEVEMENTS,
  ALL_CHALLENGES,
  challengeNumber,
  challengesInSection,
  SECTIONS,
} from "@/challenges";
import { GameHeader } from "@/components/layout/GameHeader";
import { HudLabel, PixelButton, PixelPanel, PixelProgress } from "@/components/ui/pixel";

export function LevelMap() {
  const completed = useProgress((s) => s.completed);
  const achievements = useProgress((s) => s.achievements);

  const firstOpen = ALL_CHALLENGES.find((c) => !completed[c.id])?.id ?? null;
  const courseDone = firstOpen === null;

  return (
    <div className="flex min-h-dvh flex-col gap-3 bg-ink p-2 pb-10">
      <GameHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-2">
        <div className="mt-4 text-center">
          <HudLabel tone="line">Choose your course</HudLabel>
          <h1 className="hud glow-text mt-1 text-2xl text-phos">The Git map</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {SECTIONS.length} worlds, {ALL_CHALLENGES.length} missions. Work through them in
            order, or jump straight to whatever you need.
          </p>
        </div>

        {courseDone && (
          <PixelPanel tone="phos" title="★ Course complete" titleAs="h2">
            <div className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-relaxed text-fg">
                All {ALL_CHALLENGES.length} missions cleared. You can issue a free
                certificate with your name on it and share it anywhere.
              </p>
              <Link prefetch={false} href="/account/" className="shrink-0">
                <PixelButton tone="amber">Claim your certificate ▸</PixelButton>
              </Link>
            </div>
          </PixelPanel>
        )}

        {SECTIONS.map((section) => {
          const list = challengesInSection(section.id);
          const done = list.filter((c) => completed[c.id]).length;
          const allDone = done === list.length;
          return (
            <PixelPanel
              key={section.id}
              tone={allDone ? "phos" : "line"}
              title={`World ${section.world} — ${section.title}`}
              titleAs="h2"
              actions={
                <span className={allDone ? "text-phos" : "text-muted"}>
                  {done}/{list.length} {allDone ? "★" : ""}
                </span>
              }
            >
              <div className="flex flex-col gap-3 p-4">
                <p className="text-xs text-muted">{section.blurb}</p>
                <PixelProgress value={done / list.length} segments={list.length * 2} />
                <ol className="flex flex-wrap items-center gap-1.5">
                  {list.map((c, i) => {
                    const isDone = Boolean(completed[c.id]);
                    const isNext = c.id === firstOpen;
                    return (
                      <li key={c.id} className="flex items-center">
                        {i > 0 && (
                          <span className="mx-0.5 font-mono text-line" aria-hidden>
                            ─
                          </span>
                        )}
                        <Link
                          prefetch={false}
                          href={`/challenge/${c.id}/`}
                          title={c.title}
                          // the visible text is just a number, so give screen
                          // readers and crawlers the actual mission name
                          aria-label={`Mission ${challengeNumber(c.id)}: ${c.title}`}
                          className={`px-corners flex h-11 w-11 items-center justify-center font-mono text-sm transition-transform hover:-translate-y-0.5 ${
                            isDone
                              ? "bg-phos text-ink [box-shadow:var(--glow-phos)]"
                              : isNext
                                ? "blink border-2 border-amber bg-raised text-amber"
                                : "border-2 border-line bg-raised text-muted hover:border-phos-dim hover:text-fg"
                          }`}
                        >
                          {isDone ? "✓" : String(challengeNumber(c.id)).padStart(2, "0")}
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </PixelPanel>
          );
        })}

        <PixelPanel tone="amber" title="🏅 Achievements">
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
            {ACHIEVEMENTS.map((a) => {
              const won = achievements.includes(a.id);
              return (
                <div
                  key={a.id}
                  className={`border p-3 ${won ? "border-amber-dim bg-raised" : "border-line bg-panel opacity-60"}`}
                >
                  <p className={`hud text-xs ${won ? "glow-text-amber text-amber" : "text-muted"}`}>
                    {won ? "🏅" : "▨"} {a.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    {won ? a.description : "???"}
                  </p>
                </div>
              );
            })}
          </div>
        </PixelPanel>
      </main>
    </div>
  );
}
