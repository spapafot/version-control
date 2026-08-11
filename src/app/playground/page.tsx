import Link from "next/link";
import { ALL_CHALLENGES, SECTIONS } from "@/challenges";
import { JsonLd } from "@/components/seo/JsonLd";
import { HudLabel, PixelPanel } from "@/components/ui/pixel";
import { breadcrumbSchema, webApplicationSchema } from "@/lib/schema";
import { PAGE_SEO } from "@/lib/page-seo";
import { pageMetadata } from "@/lib/seo";
import { PlaygroundClient } from "./PlaygroundClient";

const seo = PAGE_SEO["/playground/"];

export const metadata = pageMetadata({
  title: seo.title,
  description: seo.description,
  path: "/playground/",
});

export default function PlaygroundPage() {
  const first = ALL_CHALLENGES[0];
  return (
    <>
      <PlaygroundClient />
      {/* the sandbox above is client-only, so this is what a crawler reads */}
      <section
        aria-labelledby="about-playground"
        className="mx-auto w-full max-w-3xl px-4 pt-4 pb-16"
      >
        <PixelPanel tone="line" title="▪ About the playground">
          <div className="flex flex-col gap-4 p-5">
            <div>
              <HudLabel tone="line" className="mb-2 block">
                Git sandbox
              </HudLabel>
              <h1 id="about-playground" className="hud glow-text text-xl text-phos">
                A Git sandbox that runs in your browser
              </h1>
            </div>
            <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-fg">
              <p>
                The playground is an empty Git repository with a real terminal, a file
                explorer and a commit graph that redraws after every command. Nothing is
                scored and there is no mission to finish, so it is the place to try a
                command you are unsure about before running it on work that matters.
              </p>
              <p>
                Git runs entirely on your machine here. There is no server holding your
                repository, no account required, and nothing to install. Reload the page
                and you start over with an empty repository.
              </p>
              <p>
                Commands cover the everyday ground: <code className="bg-raised px-1 py-0.5 font-mono text-amber">init</code>,{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">add</code>,{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">commit</code>,{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">branch</code>,{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">merge</code>,{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">stash</code>,{" "}
                <code className="bg-raised px-1 py-0.5 font-mono text-amber">reflog</code> and
                the rest. Type <code className="bg-raised px-1 py-0.5 font-mono text-amber">help</code>{" "}
                in the terminal for the full list.
              </p>
              <p>
                If you would rather be told what to do next, the course covers the same
                ground as {ALL_CHALLENGES.length} guided missions across {SECTIONS.length}{" "}
                topics.
              </p>
            </div>
            <nav
              aria-label="Course links"
              className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs"
            >
              <Link
                prefetch={false}
                href={`/challenge/${first.id}/`}
                className="text-amber hover:text-phos"
              >
                Start the first mission →
              </Link>
              <Link prefetch={false} href="/stages/" className="text-muted hover:text-phos">
                See all {ALL_CHALLENGES.length} missions
              </Link>
              <Link
                prefetch={false}
                href="/cheatsheet/"
                className="text-muted hover:text-phos"
              >
                Git commands cheat sheet
              </Link>
            </nav>
          </div>
        </PixelPanel>
      </section>
      <JsonLd
        data={[
          webApplicationSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Playground", path: "/playground/" },
          ]),
        ]}
      />
    </>
  );
}
