"use client";

import Link from "next/link";
import { useConsent, useConsentHydrated } from "@/lib/consent";
import { PixelButton, PixelPanel } from "@/components/ui/pixel";

/**
 * Bottom strip, shown only until the visitor answers. Deliberately not a modal:
 * the course is usable while it's up.
 */
export function CookieBanner() {
  const analytics = useConsent((s) => s.analytics);
  const accept = useConsent((s) => s.accept);
  const decline = useConsent((s) => s.decline);
  const hydrated = useConsentHydrated();

  if (!hydrated || analytics !== null) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 p-2 sm:p-3"
      role="region"
      aria-label="Cookie consent"
    >
      <PixelPanel tone="line" className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4">
          <p className="flex-1 text-xs leading-relaxed text-muted">
            We use Google Analytics to count visits. Your course progress stays in
            your browser either way.{" "}
            <Link
              prefetch={false}
              href="/privacy/"
              className="text-phos underline underline-offset-2 hover:text-amber"
            >
              Privacy
            </Link>
          </p>
          <div className="flex shrink-0 gap-2">
            <PixelButton onClick={accept}>Accept</PixelButton>
            <PixelButton variant="ghost" tone="line" onClick={decline}>
              Decline
            </PixelButton>
          </div>
        </div>
      </PixelPanel>
    </div>
  );
}
