import { create } from "zustand";
import { apiFetch } from "./api";
import { authConfigured } from "./auth-config";
import { getIdToken, hasStoredSession, useAuth } from "./auth";
import { useProgress } from "./progress";
import {
  blobsEqual,
  mergeProgress,
  toBlob,
  type ProgressBlob,
} from "./progress-merge";

export { mergeProgress } from "./progress-merge";

/**
 * Background progress sync. localStorage stays the source of truth: the
 * server response is re-merged locally through `mergeProgress`, so even a
 * misbehaving server can only ever ADD to local progress (see the invariant
 * in progress-merge.ts).
 */
export type SyncStateValue =
  | "idle"
  | "syncing"
  | "synced"
  | "error"
  | "offline";

interface SyncState {
  syncState: SyncStateValue;
  lastSyncedAt: string | null;
  dirty: boolean;
}

export const useSync = create<SyncState>(() => ({
  syncState: "idle",
  lastSyncedAt: null,
  dirty: false,
}));

let engineStarted = false;
let applyingRemote = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> | null = null;

/** Push local progress, merge the server's reply back in. Safe to call any time. */
export async function syncNow(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<void> {
  if (useAuth.getState().status !== "signedIn") return;
  if (!useProgress.persist.hasHydrated()) return;

  const token = await getIdToken();
  if (!token) return;

  useSync.setState({ syncState: "syncing" });
  const local = toBlob(useProgress.getState());
  try {
    const { progress: serverMerged } = await apiFetch<{
      progress: ProgressBlob;
    }>("/v1/sync", {
      method: "POST",
      body: local,
      token,
    });
    applyRemote(serverMerged);
    useSync.setState({
      syncState: "synced",
      lastSyncedAt: new Date().toISOString(),
      dirty: false,
    });
  } catch (err) {
    console.warn("[sync]", err);
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    useSync.setState({ syncState: offline ? "offline" : "error", dirty: true });
  }
}

/** Merge a server blob into local progress without ever shrinking it. */
export function applyRemote(remote: ProgressBlob): void {
  const local = toBlob(useProgress.getState());
  const merged = mergeProgress(local, remote);
  if (blobsEqual(merged, local)) return;
  applyingRemote = true;
  try {
    // Partial set: soundOn/crtOn and the actions are untouched.
    useProgress.setState({
      completed: merged.completed,
      hintsUsed: merged.hintsUsed,
      achievements: merged.achievements,
    });
  } finally {
    applyingRemote = false;
  }
}

function scheduleSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  useSync.setState({ dirty: true });
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, 3000);
}

/**
 * Wire the sync triggers once per page load: session restore, sign-in,
 * progress changes (debounced), and coming back online.
 *
 * Cheap for anonymous visitors: without a stored Cognito session (a plain
 * localStorage probe) it resolves to signedOut and never imports aws-amplify -
 * challenge pages stay as light as before accounts existed. /account/ calls
 * `useAuth.init()` itself, so the full flow still works there.
 */
export function startSyncEngine(): void {
  if (engineStarted || typeof window === "undefined") return;
  engineStarted = true;
  if (!authConfigured()) {
    useAuth.setState({ status: "signedOut" });
    return;
  }

  useProgress.subscribe((state, prev) => {
    if (applyingRemote) return;
    if (useAuth.getState().status !== "signedIn") return;
    if (
      state.completed !== prev.completed ||
      state.hintsUsed !== prev.hintsUsed ||
      state.achievements !== prev.achievements
    ) {
      scheduleSync();
    }
  });

  useAuth.subscribe((state, prev) => {
    if (state.status === "signedIn" && prev.status !== "signedIn") {
      void syncNow();
    }
  });

  window.addEventListener("online", () => {
    if (useSync.getState().dirty) void syncNow();
  });

  if (hasStoredSession()) {
    void useAuth.getState().init(); // resolves to signedIn → the subscriber above syncs
  } else if (useAuth.getState().status === "unknown") {
    useAuth.setState({ status: "signedOut" });
  }
}
