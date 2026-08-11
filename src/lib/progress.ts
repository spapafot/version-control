import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProgressState {
  /** slug → ISO completion date */
  completed: Record<string, string>;
  /** slug → hints revealed */
  hintsUsed: Record<string, number>;
  achievements: string[];
  soundOn: boolean;
  crtOn: boolean;
  markCompleted(slug: string): void;
  recordHints(slug: string, count: number): void;
  grant(achievementId: string): void;
  toggleSound(): void;
  toggleCrt(): void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      completed: {},
      hintsUsed: {},
      achievements: [],
      soundOn: true,
      crtOn: true,
      markCompleted: (slug) => {
        if (get().completed[slug]) return;
        set({ completed: { ...get().completed, [slug]: new Date().toISOString() } });
      },
      recordHints: (slug, count) => {
        const cur = get().hintsUsed[slug] ?? 0;
        if (count > cur) set({ hintsUsed: { ...get().hintsUsed, [slug]: count } });
      },
      grant: (id) => {
        if (get().achievements.includes(id)) return;
        set({ achievements: [...get().achievements, id] });
      },
      toggleSound: () => set({ soundOn: !get().soundOn }),
      toggleCrt: () => set({ crtOn: !get().crtOn }),
    }),
    {
      name: "versioncontrol-progress",
      version: 1,
      // Version 0 is the original unversioned blob. The migration only
      // sanitizes shapes: pre-account blobs may have been hand-edited, and the
      // sync engine assumes these fields hold what their types promise.
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        const completed: Record<string, string> = {};
        if (p.completed && typeof p.completed === "object") {
          for (const [k, v] of Object.entries(p.completed as Record<string, unknown>)) {
            if (typeof v === "string") completed[k] = v;
          }
        }
        const hintsUsed: Record<string, number> = {};
        if (p.hintsUsed && typeof p.hintsUsed === "object") {
          for (const [k, v] of Object.entries(p.hintsUsed as Record<string, unknown>)) {
            if (typeof v === "number" && Number.isFinite(v) && v >= 0) hintsUsed[k] = v;
          }
        }
        const achievements = Array.isArray(p.achievements)
          ? (p.achievements as unknown[]).filter((a): a is string => typeof a === "string")
          : [];
        // Actions are restored by persist's shallow merge with the initial state.
        return {
          completed,
          hintsUsed,
          achievements,
          soundOn: typeof p.soundOn === "boolean" ? p.soundOn : true,
          crtOn: typeof p.crtOn === "boolean" ? p.crtOn : true,
        } as ProgressState;
      },
    },
  ),
);

/**
 * False until zustand has read localStorage. The static prerender has no
 * storage, so anything gated on progress (certificate CTA, done counts used in
 * decisions) must wait for this or it acts on the empty initial state.
 */
export function useProgressHydrated(): boolean {
  // Always starts false so the client's first render matches the prerendered HTML.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useProgress.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useProgress.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
