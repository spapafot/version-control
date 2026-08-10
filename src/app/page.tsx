import type { Metadata } from "next";
import Link from "next/link";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";
import { ALL_CHALLENGES, SECTIONS, challengesInSection } from "@/challenges";

export const metadata: Metadata = {
  title: "VersionControl.gr — Learn Git, using Git",
  description:
    "Free interactive Git course: a real terminal in your browser, live branch and commit visualization, and 56 missions. Nothing to install and no account needed.",
};

export default function Home() {
  const first = ALL_CHALLENGES[0];
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        {/* hero */}
        <section className="grid items-center gap-8 py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
          <div>
            <HudLabel tone="amber">git init</HudLabel>
            <h1 className="hud glow-text mt-3 text-4xl leading-tight text-phos sm:text-5xl">
              Learn Git,
              <br />
              using Git.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-fg">
              Interactive lessons built around real Git exercises. You type the
              commands, watch the repository change, and work through{" "}
              {ALL_CHALLENGES.length} missions.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link prefetch={false} href={`/challenge/${first.id}/`}>
                <PixelButton className="text-sm">▸ Start for free</PixelButton>
              </Link>
              <Link prefetch={false} href="/stages/">
                <PixelButton variant="ghost" tone="amber">
                  See the map
                </PixelButton>
              </Link>
              <Link prefetch={false} href="/playground/">
                <PixelButton variant="ghost" tone="line">
                  Playground
                </PixelButton>
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted">You and a terminal. That's the whole setup.</p>
          </div>
          <HeroDemo />
        </section>

        {/* worlds */}
        <section className="py-10">
          <HudLabel tone="line" className="mb-4 block text-center">
            {SECTIONS.length} worlds · {ALL_CHALLENGES.length} missions
          </HudLabel>
          <PixelPanel tone="line">
            <ol className="grid gap-x-6 gap-y-2 p-5 sm:grid-cols-2">
              {SECTIONS.map((s) => (
                <li key={s.id} className="flex items-baseline gap-3 text-sm">
                  <span className="hud shrink-0 text-[10px] text-amber">
                    {String(s.world).padStart(2, "0")}
                  </span>
                  <span className="text-fg">{s.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                    ×{challengesInSection(s.id).length}
                  </span>
                </li>
              ))}
            </ol>
          </PixelPanel>
          <div className="mt-6 text-center">
            <Link prefetch={false} href={`/challenge/${first.id}/`}>
              <PixelButton className="text-sm">Play the first mission ▸</PixelButton>
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
