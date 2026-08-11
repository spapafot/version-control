"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { startSyncEngine, useSync } from "@/lib/sync";

/**
 * The header's account entry. Also boots the sync engine, which is a no-op
 * for visitors without a stored session (a plain localStorage probe — no
 * aws-amplify code loads for anonymous visitors, see startSyncEngine).
 */
export function AccountLink() {
  const status = useAuth((s) => s.status);
  const syncState = useSync((s) => s.syncState);
  const dirty = useSync((s) => s.dirty);

  useEffect(() => {
    startSyncEngine();
  }, []);

  // status starts "unknown" on both the prerender and the first client render,
  // so hydration always matches; the dot livens up afterwards.
  const dot =
    status === "signedIn"
      ? dirty || syncState === "error" || syncState === "offline"
        ? "bg-amber"
        : "bg-phos"
      : "bg-line";
  const dotTitle =
    status === "signedIn"
      ? dirty || syncState === "error" || syncState === "offline"
        ? "Sync pending"
        : "Signed in"
      : undefined;

  return (
    <Link
      prefetch={false}
      href="/account/"
      className="hud flex items-center gap-1.5 border border-line px-2 py-1 text-[10px] text-muted hover:border-phos-dim hover:text-phos"
    >
      <span aria-hidden title={dotTitle} className={`inline-block size-1.5 ${dot}`} />
      account
    </Link>
  );
}
