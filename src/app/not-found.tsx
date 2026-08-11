import type { Metadata } from "next";
import Link from "next/link";
import { ALL_CHALLENGES } from "@/challenges";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";

export const metadata: Metadata = {
  title: "Page not found",
  // a 404 body served at an arbitrary URL should never be indexed
  robots: { index: false, follow: true },
};

export default function NotFound() {
  const first = ALL_CHALLENGES[0];
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
        <PixelPanel tone="amber" title="▪ 404">
          <div className="flex flex-col gap-4 p-6">
            <div>
              <HudLabel tone="amber" className="mb-2 block">
                fatal: pathspec did not match
              </HudLabel>
              <h1 className="hud glow-text text-2xl text-phos">
                There is nothing at this address
              </h1>
            </div>
            <p className="text-sm leading-relaxed text-fg">
              The page has either moved or never existed. Your course progress is
              stored in your own browser, so none of it is affected.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link prefetch={false} href="/stages/">
                <PixelButton className="text-sm">See all missions</PixelButton>
              </Link>
              <Link prefetch={false} href={`/challenge/${first.id}/`}>
                <PixelButton variant="ghost" tone="amber">
                  Start from mission 01
                </PixelButton>
              </Link>
              <Link prefetch={false} href="/playground/">
                <PixelButton variant="ghost" tone="line">
                  Playground
                </PixelButton>
              </Link>
            </div>
          </div>
        </PixelPanel>
      </main>
      <SiteFooter />
    </div>
  );
}
