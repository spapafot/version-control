import Link from "next/link";
import { ALL_CHALLENGES } from "@/challenges";
import { CHALLENGE_SEO } from "@/challenges/seo";
import { GameHeader } from "@/components/layout/GameHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { JsonLd } from "@/components/seo/JsonLd";
import { HudLabel, PixelPanel } from "@/components/ui/pixel";
import { CHEATSHEET, SHELL_HELPERS } from "@/content/cheatsheet";
import {
  breadcrumbSchema,
  itemListSchema,
  techArticleSchema,
} from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";

const seo = PAGE_SEO["/cheatsheet/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/cheatsheet/",
});

const allEntries = CHEATSHEET.flatMap((g) => g.entries);

export default function CheatsheetPage() {
  const first = ALL_CHALLENGES[0];
  return (
    <div className="flex min-h-dvh flex-col bg-ink">
      <GameHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
        <header className="py-10 text-center">
          <HudLabel tone="amber">git help</HudLabel>
          <h1 className="hud glow-text mt-3 text-3xl leading-tight text-phos">
            Git commands cheat sheet
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-fg">
            The {allEntries.length} Git commands this course covers, what each
            one is for, and the flags worth remembering. Every command here also
            runs in the{" "}
            <Link
              prefetch={false}
              href="/playground/"
              className="text-phos hover:underline"
            >
              browser playground
            </Link>
            , so you can try one instead of taking my word for it.
          </p>
        </header>

        {/* jump list: short page, but the anchors are what people link to */}
        <nav aria-label="Commands" className="mb-8">
          <PixelPanel tone="line" title="▪ Jump to a command">
            <ul className="flex flex-wrap gap-2 p-4">
              {allEntries.map((e) => (
                <li key={e.name}>
                  <a
                    href={`#${e.name}`}
                    className="block border border-line bg-raised px-2 py-1 font-mono text-xs text-muted hover:border-phos-dim hover:text-phos"
                  >
                    {e.command}
                  </a>
                </li>
              ))}
            </ul>
          </PixelPanel>
        </nav>

        <div className="flex flex-col gap-8">
          {CHEATSHEET.map((group) => (
            <section key={group.id} aria-labelledby={group.id}>
              <h2
                id={group.id}
                className="hud glow-text-amber text-lg text-amber"
              >
                {group.title}
              </h2>
              <p className="mt-2 mb-4 text-sm leading-relaxed text-muted">
                {group.intro}
              </p>

              <div className="flex flex-col gap-4">
                {group.entries.map((entry) => (
                  <PixelPanel key={entry.name} tone="line">
                    <div className="flex flex-col gap-3 p-4">
                      <h3
                        id={entry.name}
                        className="scroll-mt-4 font-mono text-base text-phos"
                      >
                        {entry.command}
                      </h3>
                      <p className="text-sm leading-relaxed text-fg">
                        {entry.summary}
                      </p>
                      <dl className="flex flex-col gap-1.5">
                        {entry.examples.map((ex) => (
                          <div
                            key={ex.code}
                            className="flex flex-col gap-0.5 border-l-2 border-line pl-3 sm:flex-row sm:items-baseline sm:gap-3"
                          >
                            <dt className="shrink-0 font-mono text-xs text-amber">
                              {ex.code}
                            </dt>
                            <dd className="text-xs leading-relaxed text-muted">
                              {ex.note}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <p className="text-xs">
                        <Link
                          prefetch={false}
                          href={`/challenge/${entry.mission}/`}
                          className="text-muted hover:text-phos"
                        >
                          Practice it: {CHALLENGE_SEO[entry.mission].title} →
                        </Link>
                      </p>
                    </div>
                  </PixelPanel>
                ))}
              </div>
            </section>
          ))}

          <section aria-labelledby="shell">
            <h2 id="shell" className="hud glow-text-amber text-lg text-amber">
              Shell commands in the sandbox
            </h2>
            <p className="mt-2 mb-4 text-sm leading-relaxed text-muted">
              Not Git, but you need them to create the files you are committing.
            </p>
            <PixelPanel tone="line">
              <dl className="flex flex-col gap-1.5 p-4">
                {SHELL_HELPERS.map((h) => (
                  <div
                    key={h.code}
                    className="flex flex-col gap-0.5 border-l-2 border-line pl-3 sm:flex-row sm:items-baseline sm:gap-3"
                  >
                    <dt className="shrink-0 font-mono text-xs text-amber">
                      {h.code}
                    </dt>
                    <dd className="text-xs leading-relaxed text-muted">
                      {h.note}
                    </dd>
                  </div>
                ))}
              </dl>
            </PixelPanel>
          </section>
        </div>

        <div className="mt-10 text-center">
          <p className="text-sm text-fg">
            Reading about Git commands is the slow way to learn them.
          </p>
          <p className="mt-2 text-sm">
            <Link
              prefetch={false}
              href={`/challenge/${first.id}/`}
              className="text-amber hover:text-phos"
            >
              Start the first mission ▸
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
      <JsonLd
        data={[
          techArticleSchema({
            title: "Git commands cheat sheet",
            description: seo.description,
            path: "/cheatsheet/",
          }),
          itemListSchema({
            name: "Git commands",
            items: allEntries.map((e) => ({
              name: e.command,
              path: `/challenge/${e.mission}/`,
            })),
          }),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Git commands cheat sheet", path: "/cheatsheet/" },
          ]),
        ]}
      />
    </div>
  );
}
