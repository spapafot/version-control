"use client";

import dynamic from "next/dynamic";
import { HudLabel } from "@/components/ui/pixel";

const VerifyScreen = dynamic(
  () => import("@/components/verify/VerifyScreen").then((m) => m.VerifyScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-24 items-center justify-center">
        <HudLabel cursor tone="phos">
          Checking credential
        </HudLabel>
      </div>
    ),
  },
);

export function VerifyClient() {
  return <VerifyScreen />;
}
