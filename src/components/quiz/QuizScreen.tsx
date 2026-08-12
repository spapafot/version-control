"use client";

import { GameHeader } from "@/components/layout/GameHeader";
import { PixelButton, PixelPanel } from "@/components/ui/pixel";
import { useQuiz } from "@/lib/quiz-store";
import { QuizHub } from "./QuizHub";
import { QuizResults } from "./QuizResults";
import { QuizRun } from "./QuizRun";

/**
 * Phase switch for the quiz. Hub, run and results are one client component
 * rather than three routes, because a timed run has nothing to prerender and
 * a URL for it would only invite a reload that abandons the run.
 */
export function QuizScreen() {
  const phase = useQuiz((s) => s.phase);
  const error = useQuiz((s) => s.error);
  const backToHub = useQuiz((s) => s.backToHub);

  if (phase === "running" || phase === "submitting") return <QuizRun />;
  if (phase === "results") return <QuizResults />;

  if (phase === "error") {
    return (
      <div className="flex min-h-dvh flex-col bg-ink">
        <GameHeader />
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
          <PixelPanel tone="red" title="▪ Quiz unavailable">
            <div className="flex flex-col gap-4 p-5">
              <p role="alert" className="text-sm text-fg">
                {error ?? "Something went wrong."}
              </p>
              <div>
                <PixelButton tone="phos" onClick={backToHub}>
                  ▸ Back to the quiz
                </PixelButton>
              </div>
            </div>
          </PixelPanel>
        </main>
      </div>
    );
  }

  // "loading" keeps the hub on screen with its button disabled, so the layout
  // does not jump between clicking Start and the first question arriving.
  return <QuizHub />;
}
