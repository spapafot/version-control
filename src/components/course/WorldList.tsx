"use client";

import Link from "next/link";
import {
  SECTIONS,
  challengesInSection,
  firstUnsolved,
  firstUnsolvedInSection,
} from "@/challenges";
import { useProgress } from "@/lib/progress";
import { PixelPanel } from "@/components/ui/pixel";

/**
 * Home-page world list. Each row links to the first unsolved mission in that
 * world (or the first mission, for a completed world you might replay), and
 * the count lights up once anything in it is cleared.
 */
export function WorldList() {
  const completed = useProgress((s) => s.completed);
  const resume = firstUnsolved(completed);

  return (
    <PixelPanel tone="line">
      <ol className="grid gap-x-6 gap-y-1 p-5 sm:grid-cols-2">
        {SECTIONS.map((s) => {
          const missions = challengesInSection(s.id);
          const done = missions.filter((c) => completed[c.id]).length;
          const target = firstUnsolvedInSection(s.id, completed);
          const allDone = done === missions.length && missions.length > 0;
          const isNext = resume !== null && target.id === resume.id;
          return (
            <li key={s.id}>
              <Link
                prefetch={false}
                href={`/challenge/${target.id}/`}
                title={s.blurb}
                className="flex items-baseline gap-3 py-1 text-sm hover:text-phos"
              >
                <span className="hud shrink-0 text-[10px] text-amber">
                  {String(s.world).padStart(2, "0")}
                </span>
                <span className={isNext ? "text-amber" : "text-fg"}>{s.title}</span>
                <span
                  className={`ml-auto shrink-0 font-mono text-xs ${
                    allDone ? "text-phos" : isNext && done > 0 ? "text-amber" : "text-muted"
                  }`}
                >
                  {allDone
                    ? `✓ ${done}/${missions.length}`
                    : done > 0
                      ? `${done}/${missions.length}`
                      : `×${missions.length}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </PixelPanel>
  );
}
