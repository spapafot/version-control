"use client";

import Link from "next/link";
import { useConsent } from "@/lib/consent";

/**
 * Shared footer for the marketing + legal pages. The app screens (challenge,
 * playground, map) are full-height and don't use it.
 */
export function SiteFooter() {
  const reset = useConsent((s) => s.reset);

  return (
    <footer className="border-t-2 border-line bg-panel py-6 text-center">
      <p className="font-mono text-xs text-muted">
        VersionControl.gr · a free interactive Git course · made with ▚ for the
        dev community
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
        <Link prefetch={false} href="/stages/" className="hover:text-phos">
          All missions
        </Link>
        <span aria-hidden>·</span>
        <Link prefetch={false} href="/quiz/" className="hover:text-phos">
          Git quiz
        </Link>
        <span aria-hidden>·</span>
        <Link prefetch={false} href="/cheatsheet/" className="hover:text-phos">
          Cheat sheet
        </Link>
        <span aria-hidden>·</span>
        <Link prefetch={false} href="/privacy/" className="hover:text-phos">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link prefetch={false} href="/terms/" className="hover:text-phos">
          Terms
        </Link>
        <span aria-hidden>·</span>
        {/* Withdrawing consent has to be as easy as giving it. */}
        <button onClick={reset} className="hover:text-phos">
          Cookie settings
        </button>
      </p>
    </footer>
  );
}
