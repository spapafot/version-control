"use client";

import dynamic from "next/dynamic";
import { HudLabel } from "@/components/ui/pixel";

/** ssr:false keeps xterm/isomorphic-git/memfs out of prerendering and in their own chunk */
const ChallengeScreen = dynamic(
  () => import("@/components/challenge/ChallengeScreen").then((m) => m.ChallengeScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-ink">
        <HudLabel cursor tone="phos">
          Starting terminal
        </HudLabel>
      </div>
    ),
  },
);

export function ChallengeClient({ slug }: { slug: string }) {
  return <ChallengeScreen slug={slug} />;
}
