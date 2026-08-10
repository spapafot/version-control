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
    { name: "versioncontrol-progress" },
  ),
);
