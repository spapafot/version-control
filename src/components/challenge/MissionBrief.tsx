import Link from "next/link";
import {
  challengeNumber,
  nextChallenge,
  prevChallenge,
  sectionOf,
  type ChallengeDefinition,
} from "@/challenges";
import { CHALLENGE_SEO } from "@/challenges/seo";
import { HudLabel, PixelPanel } from "@/components/ui/pixel";
import { RichText } from "./RichText";

/**
 * The written record of a mission, rendered on the server.
 *
 * The interactive screen sits behind a next/dynamic ssr:false boundary (xterm,
 * isomorphic-git and memfs must stay out of prerendering), so without this
 * section the page reaches a crawler as an empty body. This is plain challenge
 * data with no engine dependency, so it prerenders fine.
 *
 * It also owns the page's single h1; MissionPanel renders an h2.
 *
 * A reader reaches it through the "Lesson notes" button in MissionPanel: the
 * page renders it inside NotesDialog, which keeps it in the HTML but out of
 * the layout until then.
 */
export function MissionBrief({ challenge }: { challenge: ChallengeDefinition }) {
  const seo = CHALLENGE_SEO[challenge.id];
  const section = sectionOf(challenge.id);
  const number = String(challengeNumber(challenge.id)).padStart(2, "0");
  const prev = prevChallenge(challenge.id);
  const next = nextChallenge(challenge.id);

  return (
    // no page-level container: this only ever renders inside NotesDialog,
    // which owns the width and the padding
    <section aria-labelledby="lesson-notes" className="w-full">
      <PixelPanel tone="line" title={`▪ Lesson notes — Mission ${number}`}>
        <div className="flex flex-col gap-5 p-5">
          <div>
            {section && (
              <HudLabel tone="line" className="mb-2 block">
                World {section.world}: {section.title}
              </HudLabel>
            )}
            <h1
              id="lesson-notes"
              className="hud glow-text text-xl leading-snug text-phos"
            >
              {seo.title}
            </h1>
            <p className="mt-2 text-xs text-muted">
              Mission {number} of the course, called {challenge.title} in the game.
            </p>
          </div>

          <div className="text-sm leading-relaxed text-fg">
            <RichText text={challenge.lesson} />
          </div>

          <div className="border border-amber-dim/50 bg-raised p-4">
            <HudLabel tone="amber" className="mb-1.5 block">
              ★ Your objective
            </HudLabel>
            <div className="text-sm leading-relaxed text-fg">
              <RichText text={challenge.mission} />
            </div>
          </div>

          <div>
            <HudLabel tone="line" className="mb-2 block">
              What this mission covers
            </HudLabel>
            <ul className="flex flex-wrap gap-2">
              {seo.teaches.map((topic) => (
                <li
                  key={topic}
                  className="border border-line bg-raised px-2 py-1 font-mono text-xs text-muted"
                >
                  {topic}
                </li>
              ))}
            </ul>
          </div>

          {/* collapsed so scrolling past the game does not spoil the puzzle,
              but the text is in the HTML either way */}
          <details className="border border-line bg-raised p-3">
            <summary className="hud text-[11px] text-amber">
              Stuck? Show the {challenge.hints.length} hints
            </summary>
            <ol className="mt-3 flex flex-col gap-2">
              {challenge.hints.map((hint, i) => (
                <li key={i} className="text-xs leading-relaxed text-fg">
                  <span className="hud mr-1.5 text-[9px] text-amber">Hint {i + 1}</span>
                  <RichText text={hint} className="mb-0 inline" />
                </li>
              ))}
            </ol>
          </details>

          <nav
            aria-label="Mission navigation"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-xs"
          >
            {prev ? (
              <Link
                prefetch={false}
                href={`/challenge/${prev.id}/`}
                className="text-muted hover:text-phos"
              >
                ← {CHALLENGE_SEO[prev.id].title}
              </Link>
            ) : (
              <span className="text-muted">This is the first mission.</span>
            )}
            <Link prefetch={false} href="/stages/" className="text-muted hover:text-phos">
              All 63 missions
            </Link>
            {next && (
              <Link
                prefetch={false}
                href={`/challenge/${next.id}/`}
                className="ml-auto text-amber hover:text-phos"
              >
                {CHALLENGE_SEO[next.id].title} →
              </Link>
            )}
          </nav>
        </div>
      </PixelPanel>
    </section>
  );
}
