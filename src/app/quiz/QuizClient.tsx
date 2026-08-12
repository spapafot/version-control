"use client";

import dynamic from "next/dynamic";
import { HudLabel } from "@/components/ui/pixel";

/** ssr:false keeps the timed run, which has nothing to prerender, out of the build */
const QuizScreen = dynamic(
  () => import("@/components/quiz/QuizScreen").then((m) => m.QuizScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <HudLabel cursor tone="phos">
          Loading quiz
        </HudLabel>
      </div>
    ),
  },
);

export function QuizClient() {
  return <QuizScreen />;
}
