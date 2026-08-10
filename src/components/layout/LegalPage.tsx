import type { ReactNode } from "react";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HudLabel } from "@/components/ui/pixel";

/** Shell for the static legal pages: header, readable column, shared footer. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <HudLabel tone="line">Last updated {updated}</HudLabel>
        <h1 className="hud glow-text mt-2 text-2xl text-phos">{title}</h1>
        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-fg">
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

/** One titled block of legal copy. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="hud mb-2 text-xs text-amber">{heading}</h2>
      <div className="flex flex-col gap-2.5 text-muted">{children}</div>
    </section>
  );
}
