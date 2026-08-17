import Link from "next/link";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { JsonLd } from "@/components/seo/JsonLd";
import { HudLabel, PixelButton } from "@/components/ui/pixel";
import { ALL_CHALLENGES, SECTIONS, challengesInSection } from "@/challenges";
import { ResumeCta } from "@/components/course/ResumeCta";
import { WorldList } from "@/components/course/WorldList";
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
              <ResumeCta startLabel="▸ Start" continueLabel="Continue ▸" />
              <Link prefetch={false} href="/stages/">
                <PixelButton variant="ghost" tone="amber">
                  See the map
                </PixelButton>
              </Link>
              <Link prefetch={false} href="/quiz/">
                <PixelButton variant="ghost" tone="line">
                  Quiz
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
          <WorldList />
          <div className="mt-4 flex flex-col items-center gap-2.5">
            <ResumeCta
              startLabel="Play the first mission ▸"
              continueLabel="Continue ▸"
            />
            <Link
              prefetch={false}
              href="/cheatsheet/"
              className="font-mono text-xs text-muted hover:text-phos"
            >
              or skim the Git commands cheat sheet
            </Link>
            <Link
              prefetch={false}
              href="/quiz/"
              className="font-mono text-xs text-muted hover:text-phos"
            >
              or test yourself with the timed Git quiz
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
