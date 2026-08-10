import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** null = never asked; the banner shows only in that state. */
export type ConsentValue = "granted" | "denied" | null;

interface ConsentState {
  analytics: ConsentValue;
  accept(): void;
  decline(): void;
  reset(): void;
}

export const useConsent = create<ConsentState>()(
  persist(
    (set) => ({
      analytics: null,
      accept: () => set({ analytics: "granted" }),
      decline: () => set({ analytics: "denied" }),
      reset: () => set({ analytics: null }),
    }),
    { name: "versioncontrol-consent" },
  ),
);

/**
 * False until zustand has read localStorage. Consent-aware components render
 * nothing until it flips: the static prerender has no storage, so rendering on
 * the first pass flashes the banner at visitors who already answered.
 */
export function useConsentHydrated(): boolean {
  // Always starts false so the client's first render matches the prerendered HTML.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useConsent.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useConsent.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
