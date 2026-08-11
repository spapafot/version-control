"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { useGame } from "@/lib/game-store";
import { useProgress } from "@/lib/progress";
import { ACHIEVEMENTS, ALL_CHALLENGES, challengeNumber, nextChallenge } from "@/challenges";
import { playAchievement, playSuccess } from "@/lib/sound";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";

export function SuccessOverlay() {
  const challenge = useGame((s) => s.challenge);
  const completed = useGame((s) => s.completed);
  const overlayDismissed = useGame((s) => s.overlayDismissed);
  const dismissOverlay = useGame((s) => s.dismissOverlay);
  const progress = useProgress();
  const celebrated = useRef<string | null>(null);

  const isNewAchievement =
    challenge?.achievement && !progress.achievements.includes(challenge.achievement);

  useEffect(() => {
    if (!completed || !challenge || celebrated.current === challenge.id) return;
    celebrated.current = challenge.id;

    const grantAchievement = challenge.achievement && !useProgress.getState().achievements.includes(challenge.achievement);
    progress.markCompleted(challenge.id);
    if (challenge.achievement) progress.grant(challenge.achievement);

    if (useProgress.getState().soundOn) {
      if (grantAchievement) playAchievement();
      else playSuccess();
    }

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.6 },
        colors: ["#3dff74", "#ffb000", "#35e0e0", "#ff5ca8"],
        shapes: ["square"],
        scalar: 0.9,
        disableForReducedMotion: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, challenge]);

  if (!completed || !challenge || overlayDismissed) return null;

  const next = nextChallenge(challenge.id);
  const achievement = challenge.achievement
    ? ACHIEVEMENTS.find((a) => a.id === challenge.achievement)
    : null;
  // a real aggregate, not "was this the last mission": finishing out of order counts
  const allDone = ALL_CHALLENGES.every((c) => progress.completed[c.id]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/85 p-4">
      <PixelPanel tone="phos" className="power-on w-full max-w-md">
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <HudLabel tone="phos">Mission {String(challengeNumber(challenge.id)).padStart(2, "0")}</HudLabel>
          <h2 className="hud glow-text text-2xl text-phos">Completed!</h2>
          <p className="font-mono text-2xl tracking-[0.3em] text-amber" aria-hidden>
            ★ ★ ★
          </p>
          {challenge.successMessage && (
            <p className="text-sm leading-relaxed text-fg">{challenge.successMessage}</p>
          )}
          {achievement && (
            <div className="w-full border border-amber-dim/60 bg-raised p-3">
              <HudLabel tone="amber" className="mb-1 block">
                {isNewAchievement ? "New achievement!" : "Achievement"}
              </HudLabel>
              <p className="hud text-sm text-amber">🏅 {achievement.title}</p>
              <p className="mt-1 text-xs text-muted">{achievement.description}</p>
            </div>
          )}
          {allDone && (
            <p className="text-sm leading-relaxed text-fg">
              That was the last one: all {ALL_CHALLENGES.length} missions complete. 🏆
            </p>
          )}
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            {allDone ? (
              <>
                <Link prefetch={false} href="/account/">
                  <PixelButton tone="amber">Claim your certificate ▸</PixelButton>
                </Link>
                <Link prefetch={false} href="/stages/">
                  <PixelButton variant="ghost" tone="line">
                    Back to the map
                  </PixelButton>
                </Link>
              </>
            ) : next ? (
              <Link prefetch={false} href={`/challenge/${next.id}/`}>
                <PixelButton>Next mission ▸</PixelButton>
              </Link>
            ) : (
              <Link prefetch={false} href="/stages/">
                <PixelButton>Back to the map</PixelButton>
              </Link>
            )}
            <PixelButton variant="ghost" tone="line" onClick={dismissOverlay}>
              Stay here
            </PixelButton>
          </div>
        </div>
      </PixelPanel>
    </div>
  );
}
