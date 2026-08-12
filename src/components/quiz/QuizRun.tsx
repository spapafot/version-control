"use client";

import { useCallback, useEffect, useState } from "react";
import { RichText } from "@/components/challenge/RichText";
import { GameHeader } from "@/components/layout/GameHeader";
import { HudLabel, PixelButton, PixelChoice, PixelPanel, PixelProgress } from "@/components/ui/pixel";
import { SECTIONS } from "@/challenges";
import { MODE_LABELS } from "@/lib/quiz-api";
import { useQuiz } from "@/lib/quiz-store";
import { QuizTimer } from "./QuizTimer";

const LETTERS = ["A", "B", "C", "D"];

function topicLabel(topic: string | null): string {
  return SECTIONS.find((s) => s.id === topic)?.title ?? "Git";
}

export function QuizRun() {
  const session = useQuiz((s) => s.session);
  const index = useQuiz((s) => s.index);
  const answers = useQuiz((s) => s.answers);
  const phase = useQuiz((s) => s.phase);
  const choose = useQuiz((s) => s.choose);
  const next = useQuiz((s) => s.next);
  const prev = useQuiz((s) => s.prev);
  const goTo = useQuiz((s) => s.goTo);
  const finish = useQuiz((s) => s.finish);

  // Quit is a two-step confirm; moving on takes back the first step.
  const [confirmQuit, setConfirmQuit] = useState(false);
  useEffect(() => setConfirmQuit(false), [index]);

  const question = session?.questions[index];
  const answeredCount = Object.keys(answers).length;
  const total = session?.questions.length ?? 0;

  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || question === undefined) return;
      const key = event.key.toLowerCase();
      const byNumber = "1234".indexOf(key);
      const byLetter = "abcd".indexOf(key);
      const pick = byNumber !== -1 ? byNumber : byLetter;
      if (pick !== -1 && pick < question.options.length) {
        event.preventDefault();
        choose(question.id, pick);
        return;
      }
      if (key === "arrowright") {
        event.preventDefault();
        next();
      } else if (key === "arrowleft") {
        event.preventDefault();
        prev();
      }
    },
    [choose, next, prev, question],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (session === null || question === undefined) return null;

  const chosen = answers[question.id];
  const submitting = phase === "submitting";
  const allAnswered = answeredCount >= total;
  // In a sprint the pool is everything we have, so it is not a target to reach:
  // no denominator, no progress bar towards it, and no dot grid (that would be
  // a hundred-plus squares).
  const isSprint = session.mode === "sprint";

  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader right={<QuizTimer />} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <HudLabel tone="amber">{MODE_LABELS[session.mode]}</HudLabel>
          <HudLabel tone="line">
            {isSprint ? `Question ${index + 1}` : `Question ${index + 1} of ${total}`}
          </HudLabel>
          {!isSprint && (
            <PixelProgress
              value={total === 0 ? 0 : answeredCount / total}
              segments={Math.min(total, 20)}
              className="min-w-32 flex-1"
            />
          )}
          <span className="flex-1" />
          <HudLabel tone="line">
            {isSprint ? `${answeredCount} answered` : `${answeredCount}/${total} answered`}
          </HudLabel>
        </div>

        <PixelPanel tone="line" title={`▪ ${topicLabel(question.topic)}`}>
          <div className="flex flex-col gap-4 p-5">
            <div className="text-sm leading-relaxed text-fg">
              <RichText text={question.prompt} />
            </div>

            {/*
              A radiogroup rather than a list of buttons: the four options are
              one choice, and arrow-key semantics come for free.
            */}
            <div
              role="radiogroup"
              aria-label="Answer options"
              className="flex flex-col gap-2"
            >
              {question.options.map((option, i) => (
                <PixelChoice
                  key={i}
                  role="radio"
                  aria-checked={chosen === i}
                  letter={LETTERS[i]}
                  state={chosen === i ? "picked" : "idle"}
                  disabled={submitting}
                  onClick={() => choose(question.id, i)}
                >
                  {option}
                </PixelChoice>
              ))}
            </div>

            <p className="text-xs text-muted">Press 1 to 4 or A to D to answer.</p>
          </div>
        </PixelPanel>

        <nav
          aria-label="Questions"
          className={`flex-wrap items-center gap-1 ${isSprint ? "hidden" : "flex"}`}
        >
          {session.questions.map((q, i) => {
            const done = answers[q.id] !== undefined;
            return (
              <button
                key={q.id}
                onClick={() => goTo(i)}
                aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                aria-current={i === index ? "true" : undefined}
                className={`h-4 w-4 border text-[0px] ${
                  i === index
                    ? "border-amber bg-amber"
                    : done
                      ? "border-phos-dim bg-phos-dim"
                      : "border-line bg-raised hover:border-muted"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <PixelButton tone="line" variant="ghost" onClick={prev} disabled={index === 0}>
            ← Back
          </PixelButton>
          <PixelButton
            tone="line"
            variant="ghost"
            onClick={next}
            disabled={index >= total - 1}
          >
            Skip →
          </PixelButton>
          <span className="flex-1" />
          {/* "Finish early" is also one click, but this one additionally gives up
              the board row, so a misclick here costs something. Two steps. */}
          <PixelButton
            tone={confirmQuit ? "red" : "line"}
            variant="ghost"
            onClick={() => (confirmQuit ? void finish({ rank: false }) : setConfirmQuit(true))}
            disabled={submitting}
            title="End the run now, scored and reviewed but off the leaderboard"
          >
            {confirmQuit ? "Confirm quit" : "Quit"}
          </PixelButton>
          <PixelButton
            tone={allAnswered && !isSprint ? "phos" : "amber"}
            variant={allAnswered && !isSprint ? "solid" : "ghost"}
            onClick={() => void finish()}
            disabled={submitting}
          >
            {submitting
              ? "Marking…"
              : allAnswered && !isSprint
                ? "▸ Finish"
                : "Finish early"}
          </PixelButton>
        </div>
      </main>
    </div>
  );
}
