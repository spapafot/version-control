import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QuizMode } from "./quiz-api";

/**
 * Device-local quiz records, so an anonymous player still sees their own best.
 *
 * Deliberately a separate store with its own localStorage key rather than an
 * addition to `versioncontrol-progress`: that store's shape is mirrored by
 * backend/app/merge.py and whitelisted by mergeProgress, and quiz results have
 * no business in the course sync contract. The leaderboard is the server's
 * record; this is only what this browser remembers.
 */

export interface LocalBest {
  score: number;
  total: number;
  elapsedMs: number;
  /** ISO date of the run that set this best */
  at: string;
}

/** One record per mode, e.g. "sprint". */
type BestKey = string;

export function bestKey(mode: QuizMode): BestKey {
  return mode;
}

/** Higher score wins; equal scores are settled by the quicker run. */
function beats(candidate: LocalBest, incumbent: LocalBest): boolean {
  if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
  return candidate.elapsedMs < incumbent.elapsedMs;
}

interface QuizLocalState {
  bests: Record<BestKey, LocalBest>;
  runs: number;
  /**
   * Records a finished run; returns true when it set a new local best.
   *
   * `updateBest: false` still counts the run but leaves the best alone, for a
   * practice run or a mid-run quit: a deliberate throwaway must not overwrite
   * the figure the hub shows you.
   */
  recordRun(
    mode: QuizMode,
    run: LocalBest,
    options?: { updateBest?: boolean },
  ): boolean;
  clear(): void;
}

export const useQuizLocal = create<QuizLocalState>()(
  persist(
    (set, get) => ({
      bests: {},
      runs: 0,
      recordRun: (mode, run, options) => {
        const key = bestKey(mode);
        const current = get().bests[key];
        const improved =
          options?.updateBest !== false &&
          (current === undefined || beats(run, current));
        // `runs` counts every finished run either way. It is the honest count,
        // and it is the hub's leaderboard refresh token.
        set({
          runs: get().runs + 1,
          bests: improved ? { ...get().bests, [key]: run } : get().bests,
        });
        return improved;
      },
      clear: () => set({ bests: {}, runs: 0 }),
    }),
    {
      name: "versioncontrol-quiz",
      version: 2,
      // Same reasoning as the progress store: a hand-edited blob must not be
      // able to make the UI render NaN, so every field is filtered on read.
      //
      // Version 1 keyed bests as "{mode}:{tier}" back when a player picked a
      // difficulty. Those keys are dropped rather than reinterpreted: a best set
      // on easy-only questions is not comparable with a balanced run, so
      // carrying it across would flatter the record it replaced.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const bests: Record<BestKey, LocalBest> = {};
        if (p.bests && typeof p.bests === "object") {
          for (const [key, value] of Object.entries(p.bests as Record<string, unknown>)) {
            if (key.includes(":")) continue; // version 1 mode:tier key

            const v = (value ?? {}) as Record<string, unknown>;
            const numbers = ["score", "total", "elapsedMs"] as const;
            if (numbers.every((n) => typeof v[n] === "number" && Number.isFinite(v[n]))) {
              bests[key] = {
                score: v.score as number,
                total: v.total as number,
                elapsedMs: v.elapsedMs as number,
                at: typeof v.at === "string" ? v.at : "",
              };
            }
          }
        }
        return {
          bests,
          runs: typeof p.runs === "number" && Number.isFinite(p.runs) ? p.runs : 0,
        } as QuizLocalState;
      },
    },
  ),
);

/**
 * False until zustand has read localStorage. The quiz page is prerendered with
 * no storage, so anything showing a stored best must wait for this or it
 * renders the empty initial state and then flips.
 */
export function useQuizLocalHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useQuizLocal.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useQuizLocal.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
