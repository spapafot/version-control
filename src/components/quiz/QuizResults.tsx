"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { RichText } from "@/components/challenge/RichText";
import { GameHeader } from "@/components/layout/GameHeader";
import { SECTIONS } from "@/challenges";
import {
  HudLabel,
  PixelButton,
  PixelChoice,
  PixelPanel,
  PixelProgress,
} from "@/components/ui/pixel";
import { useProgress } from "@/lib/progress";
import { formatElapsed, MODE_LABELS, rankReasonMessage } from "@/lib/quiz-api";
import { useQuiz } from "@/lib/quiz-store";
import { playSuccess } from "@/lib/sound";

const LETTERS = ["A", "B", "C", "D"];

function topicLabel(topic: string | null): string {
  return SECTIONS.find((s) => s.id === topic)?.title ?? "Git";
}

export function QuizResults() {
  const result = useQuiz((s) => s.result);
  const localBest = useQuiz((s) => s.localBest);
  const start = useQuiz((s) => s.start);
  const backToHub = useQuiz((s) => s.backToHub);
  const soundOn = useProgress((s) => s.soundOn);
  const played = useRef(false);

  useEffect(() => {
    // A fanfare for every run regardless of score would be noise; save it for
    // an actual improvement.
    if (result === null || played.current) return;
    played.current = true;
    if (localBest && soundOn) playSuccess();
  }, [result, localBest, soundOn]);

  if (result === null) return null;

  const { score, total, answered, elapsedMs, review } = result;
  const missed = review.filter((item) => item.chosen !== item.correct);
  // A sprint always runs the full three minutes and its pool is not a target,
  // so neither the clock nor a denominator says anything here.
  const isSprint = result.mode === "sprint";

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5">
        <PixelPanel tone="phos" title="▪ Run complete">
          <div className="power-on flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <HudLabel tone="line" className="mb-1 block">
                  {isSprint ? "Correct" : "Score"}
                </HudLabel>
                <p className="hud glow-text text-3xl text-phos">
                  {score}
                  {!isSprint && <span className="text-lg text-muted">/{total}</span>}
                </p>
              </div>
              {!isSprint && (
                <div>
                  <HudLabel tone="line" className="mb-1 block">
                    Time
                  </HudLabel>
                  <p className="hud text-xl text-fg">{formatElapsed(elapsedMs)}</p>
                </div>
              )}
              <div>
                <HudLabel tone="line" className="mb-1 block">
                  Answered
                </HudLabel>
                <p className="hud text-xl text-fg">
                  {isSprint ? answered : `${answered}/${total}`}
                </p>
              </div>
              <div>
                <HudLabel tone="line" className="mb-1 block">
                  Mode
                </HudLabel>
                <p className="hud text-xl text-fg">{MODE_LABELS[result.mode]}</p>
              </div>
            </div>

            {/* Set of 20 fills towards the twenty on offer. A sprint has no such
                target, so the bar shows accuracy over what was attempted. */}
            <PixelProgress
              value={
                isSprint
                  ? answered === 0
                    ? 0
                    : score / answered
                  : total === 0
                    ? 0
                    : score / total
              }
              segments={20}
            />
            {isSprint && answered > 0 && (
              <p className="text-xs text-muted">
                {Math.round((score / answered) * 100)}% of the {answered} you answered.
              </p>
            )}

            <div className="flex flex-col gap-1.5 text-sm">
              {result.personalBest ? (
                <p className="text-phos">
                  New personal best. This run is on the leaderboard.
                </p>
              ) : result.ranked ? (
                <p className="text-muted">Counted, though your best still stands.</p>
              ) : (
                <p className="text-amber">
                  {rankReasonMessage(result.rankReason ?? "anonymous")}
                </p>
              )}
              {localBest && !result.personalBest && (
                <p className="text-muted">Best on this device so far.</p>
              )}
              {result.rankReason === "anonymous" && (
                <Link
                  prefetch={false}
                  href="/account/"
                  className="text-amber hover:text-phos"
                >
                  Create a free account →
                </Link>
              )}
              {result.rankReason === "no_nickname" && (
                <Link
                  prefetch={false}
                  href="/account/"
                  className="text-amber hover:text-phos"
                >
                  Pick a nickname →
                </Link>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <PixelButton tone="phos" onClick={() => void start()}>
                ▸ Play again
              </PixelButton>
              <PixelButton tone="line" variant="ghost" onClick={backToHub}>
                Back to the quiz
              </PixelButton>
            </div>
          </div>
        </PixelPanel>

        <PixelPanel
          tone="line"
          title={`▪ Review · ${missed.length} to look at`}
          titleAs="h2"
        >
          <div className="flex flex-col gap-5 p-5">
            {missed.length === 0 && (
              <p className="text-sm text-phos">You answered every question correctly.</p>
            )}
            {review.map((item, position) => {
              const wasRight = item.chosen === item.correct;
              return (
                <article
                  key={item.id}
                  className="flex flex-col gap-2.5 border-b border-line pb-5 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <HudLabel tone={wasRight ? "phos" : "red"}>
                      {position + 1}. {wasRight ? "Correct" : item.chosen === null ? "Not answered" : "Wrong"}
                    </HudLabel>
                    <HudLabel tone="line">{topicLabel(item.topic)}</HudLabel>
                  </div>

                  <div className="text-sm leading-relaxed text-fg">
                    <RichText text={item.prompt} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {item.options.map((option, i) => {
                      const state =
                        item.chosen === i
                          ? i === item.correct
                            ? "correct"
                            : "wrong"
                          : i === item.correct
                            ? "missed"
                            : "idle";
                      return (
                        <PixelChoice
                          key={i}
                          letter={LETTERS[i]}
                          state={state}
                          disabled
                          aria-label={
                            state === "correct"
                              ? `Your answer, correct: ${option}`
                              : state === "wrong"
                                ? `Your answer, wrong: ${option}`
                                : state === "missed"
                                  ? `Correct answer: ${option}`
                                  : option
                          }
                        >
                          {option}
                        </PixelChoice>
                      );
                    })}
                  </div>

                  <div className="border-l-2 border-phos-dim pl-3 text-xs leading-relaxed text-muted">
                    <RichText text={item.explanation} />
                    {item.challenge !== null && (
                      <Link
                        prefetch={false}
                        href={`/challenge/${item.challenge}/`}
                        className="text-amber hover:text-phos"
                      >
                        Practise this in the course →
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </PixelPanel>
      </main>
    </div>
  );
}
