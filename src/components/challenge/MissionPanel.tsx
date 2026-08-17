"use client";

import Link from "next/link";
import { useGame } from "@/lib/game-store";
import { useNotesDialog } from "@/lib/notes-dialog";
import { useProgress } from "@/lib/progress";
import { challengeNumber, SECTIONS } from "@/challenges";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";
import { RichText } from "./RichText";

export function MissionPanel() {
  const challenge = useGame((s) => s.challenge);
  const evaluation = useGame((s) => s.evaluation);
  const hintsShown = useGame((s) => s.hintsShown);
  const revealHint = useGame((s) => s.revealHint);
  const reset = useGame((s) => s.reset);
  const completed = useGame((s) => s.completed);
  const recordHints = useProgress((s) => s.recordHints);
  const openNotes = useNotesDialog((s) => s.openNotes);

  if (!challenge) return null;

  const number = String(challengeNumber(challenge.id)).padStart(2, "0");
  const section = SECTIONS.find((s) => s.id === challenge.section);

  return (
    <PixelPanel
      tone={completed ? "phos" : "amber"}
      title={`Mission ${number} — ${section?.title ?? ""}`}
      className="h-full"
      bodyClassName="overflow-auto"
    >
      <div className="flex flex-col gap-4 p-4">
        <div>
          {/* h2, not h1: the server-rendered MissionBrief below owns the page's
              single h1 so the static HTML has a real heading for crawlers */}
          <h2 className="hud glow-text-amber mb-3 text-lg leading-snug text-amber">
            {challenge.title}
          </h2>
          <div className="text-[13px] leading-relaxed text-fg">
            <RichText text={challenge.lesson} />
          </div>
        </div>

        <div className="border border-amber-dim/50 bg-raised p-3">
          <HudLabel tone="amber" className="mb-1.5 block">
            ★ Mission
          </HudLabel>
          <div className="text-[13px] font-medium leading-relaxed text-fg">
            <RichText text={challenge.mission} />
          </div>
        </div>

        {evaluation && (
          <div>
            <HudLabel tone="line" className="mb-1.5 block">
              Objectives
            </HudLabel>
            <ul className="flex flex-col gap-1">
              {evaluation.results.map((r, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-2 text-xs ${r.pass ? "text-phos" : "text-muted"}`}
                >
                  <span className="mt-px shrink-0 font-mono" aria-hidden>
                    {r.pass ? "[✓]" : "[ ]"}
                  </span>
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <HudLabel tone="line" className="mb-1.5 block">
            Hints ({hintsShown}/{challenge.hints.length})
          </HudLabel>
          <div className="flex flex-col gap-2">
            {challenge.hints.slice(0, hintsShown).map((hint, i) => (
              <div key={i} className="border border-line bg-raised p-2.5 text-xs text-fg">
                <span className="hud mr-1.5 text-[9px] text-amber">Hint {i + 1}</span>
                <RichText text={hint} className="mb-0 inline" />
              </div>
            ))}
            {hintsShown < challenge.hints.length && (
              <PixelButton
                variant="ghost"
                tone="amber"
                onClick={() => {
                  revealHint();
                  recordHints(challenge.id, hintsShown + 1);
                }}
              >
                {hintsShown === 0 ? "Give me a hint" : "Give me another"}
              </PixelButton>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
          <PixelButton variant="ghost" tone="red" onClick={() => void reset()}>
            ↺ Reset
          </PixelButton>
          {/* the written lesson used to sit under the game; it is a dialog now
              so the mission fits one screen */}
          <PixelButton variant="ghost" tone="amber" onClick={openNotes}>
            ▪ Notes
          </PixelButton>
          <Link prefetch={false} href="/stages/" className="ml-auto">
            <PixelButton variant="ghost" tone="line">
              ← Map
            </PixelButton>
          </Link>
        </div>
      </div>
    </PixelPanel>
  );
}
