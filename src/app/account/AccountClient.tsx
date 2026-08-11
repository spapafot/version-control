"use client";

import dynamic from "next/dynamic";
import { HudLabel } from "@/components/ui/pixel";

const AccountScreen = dynamic(
  () => import("@/components/account/AccountScreen").then((m) => m.AccountScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-40 items-center justify-center">
        <HudLabel cursor tone="phos">
          Loading account
        </HudLabel>
      </div>
    ),
  },
);

export function AccountClient() {
  return <AccountScreen />;
}
