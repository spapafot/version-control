import Link from "next/link";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { JsonLd } from "@/components/seo/JsonLd";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";
import { ALL_CHALLENGES, SECTIONS, challengesInSection } from "@/challenges";
import { courseSchema, itemListSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";

const seo = PAGE_SEO["/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/",
});

export default function Home() {
  const first = ALL_CHALLENGES[0];
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-4">
        {/* hero */}
        <section className="grid items-center gap-8 py-6 lg:grid-cols-[1.1fr_1fr] lg:py-8">
          <div>
            <HudLabel tone="amber">git init</HudLabel>
            <h1 className="hud glow-text mt-3 text-4xl leading-tight text-phos sm:text-5xl">
              Learn Git,
              <br />
              using Git.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-fg">
              Interactive lessons built around real Git exercises. You type the
              commands, watch the repository change, and work through{" "}
              {ALL_CHALLENGES.length} missions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link prefetch={false} href={`/challenge/${first.id}/`}>
                <PixelButton className="text-sm">▸ Start</PixelButton>
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
            <p className="mt-4 text-xs text-muted">
              You and a terminal. That&apos;s the whole setup.
            </p>
          </div>
          <HeroDemo />
        </section>

        {/* worlds */}
        <section aria-labelledby="what-you-learn" className="py-4">
          <HudLabel tone="line" className="mb-2 block text-center">
            {SECTIONS.length} worlds · {ALL_CHALLENGES.length} missions
          </HudLabel>
          <h2
            id="what-you-learn"
            className="hud mb-3 text-center text-lg text-phos"
          >
            What the course covers
          </h2>
          <PixelPanel tone="line">
            <ol className="grid gap-x-6 gap-y-1 p-5 sm:grid-cols-2">
              {SECTIONS.map((s) => {
                const missions = challengesInSection(s.id);
                return (
                  <li key={s.id}>
                    <Link
                      prefetch={false}
                      href={`/challenge/${missions[0].id}/`}
                      title={s.blurb}
                      className="flex items-baseline gap-3 py-1 text-sm hover:text-phos"
                    >
                      <span className="hud shrink-0 text-[10px] text-amber">
                        {String(s.world).padStart(2, "0")}
                      </span>
                      <span className="text-fg">{s.title}</span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted">
                        ×{missions.length}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </PixelPanel>
          <div className="mt-4 flex flex-col items-center gap-2.5">
            <Link prefetch={false} href={`/challenge/${first.id}/`}>
              <PixelButton className="text-sm">
                Play the first mission ▸
              </PixelButton>
            </Link>
            <Link
              prefetch={false}
              href="/cheatsheet/"
              className="font-mono text-xs text-muted hover:text-phos"
            >
              or skim the Git commands cheat sheet
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd
        data={[
          courseSchema(),
          itemListSchema({
            name: "Git course topics",
            items: SECTIONS.map((s) => ({
              name: s.title,
              path: `/challenge/${challengesInSection(s.id)[0].id}/`,
            })),
          }),
        ]}
      />
    </div>
  );
}
