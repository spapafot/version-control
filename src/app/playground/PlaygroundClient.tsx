"use client";

import dynamic from "next/dynamic";
import { HudLabel } from "@/components/ui/pixel";

const PlaygroundScreen = dynamic(
  () => import("@/components/challenge/PlaygroundScreen").then((m) => m.PlaygroundScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <HudLabel cursor tone="phos">
          Starting playground
        </HudLabel>
      </div>
    ),
  },
);

export function PlaygroundClient() {
  return <PlaygroundScreen />;
}
