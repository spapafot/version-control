import Link from "next/link";
import { ALL_CHALLENGES, SECTIONS } from "@/challenges";
import { HudLabel, PixelPanel } from "@/components/ui/pixel";

/**
 * What the playground is, rendered on the server.
 *
 * The sandbox itself is behind a next/dynamic ssr:false boundary, so this is
 * the only thing a crawler reads on /playground/ — it owns the page's single
 * h1 and the body text `pnpm seo:check` insists on. A reader reaches it
 * through the About button in the header; NotesDialog keeps it in the HTML
 * but out of the layout until then.
 */
export function PlaygroundAbout() {
  const first = ALL_CHALLENGES[0];
  return (
    // no page-level container: this only ever renders inside NotesDialog,
    // which owns the width and the padding
    <section aria-labelledby="about-playground" className="w-full">
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
              The playground is an empty Git repository with a real terminal, a
              file explorer and a commit graph that redraws after every command.
              Nothing is scored and there is no mission to finish, so it is the
              place to try a command you are unsure about before running it on
              work that matters.
            </p>
            <p>
              Git runs entirely on your machine here. There is no server holding
              your repository, no account required, and nothing to install.
              Reload the page and you start over with an empty repository.
            </p>
            <p>
              Commands cover the everyday ground:{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                init
              </code>
              ,{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                add
              </code>
              ,{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                commit
              </code>
              ,{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                branch
              </code>
              ,{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                merge
              </code>
              ,{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                stash
              </code>
              ,{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                reflog
              </code>{" "}
              and the rest. Type{" "}
              <code className="bg-raised px-1 py-0.5 font-mono text-amber">
                help
              </code>{" "}
              in the terminal for the full list.
            </p>
            <p>
              If you would rather be told what to do next, the course covers the
              same ground as {ALL_CHALLENGES.length} guided missions across{" "}
              {SECTIONS.length} topics.
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
            <Link
              prefetch={false}
              href="/stages/"
              className="text-muted hover:text-phos"
            >
              See all {ALL_CHALLENGES.length} missions
            </Link>
            <Link
              prefetch={false}
              href="/cheatsheet/"
              className="text-muted hover:text-phos"
            >
              Cheat sheet
            </Link>
          </nav>
        </div>
      </PixelPanel>
    </section>
  );
}
