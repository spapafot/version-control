"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ALL_CHALLENGES } from "@/challenges";
import { ConfirmCodePanel, SignInPanel } from "./AuthPanels";
import { CertificatePanel } from "./CertificatePanel";
import { apiFetch, ApiError, type MeResponse } from "@/lib/api";
import { getIdToken, useAuth } from "@/lib/auth";
import type { Certificate } from "@/lib/certificate";
import { useProgress, useProgressHydrated } from "@/lib/progress";
import { applyRemote, startSyncEngine, syncNow, useSync } from "@/lib/sync";
import {
  HudLabel,
  PixelButton,
  PixelField,
  PixelInput,
  PixelPanel,
  PixelProgress,
} from "@/components/ui/pixel";

export function AccountScreen() {
  const status = useAuth((s) => s.status);
  const hydrated = useProgressHydrated();

  useEffect(() => {
    startSyncEngine();
    void useAuth.getState().init();
  }, []);

  if (!hydrated || status === "unknown") {
    return (
      <div className="flex min-h-40 items-center justify-center">
        <HudLabel cursor tone="phos">
          Checking session
        </HudLabel>
      </div>
    );
  }
  if (status === "confirmCode") return <ConfirmCodePanel />;
  if (status === "signedOut") return <SignInPanel />;
  return <Dashboard />;
}

function Dashboard() {
  const email = useAuth((s) => s.email);
  const completed = useProgress((s) => s.completed);
  const syncState = useSync((s) => s.syncState);
  const lastSyncedAt = useSync((s) => s.lastSyncedAt);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameSaved, setNameSaved] = useState(true);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);

  const done = Object.keys(completed).filter((slug) =>
    ALL_CHALLENGES.some((c) => c.id === slug),
  ).length;
  const total = ALL_CHALLENGES.length;
  const allDone = done === total;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getIdToken();
      if (!token) return;
      try {
        const data = await apiFetch<MeResponse>("/v1/me", { token });
        if (cancelled) return;
        setCert(data.certificate);
        setName(data.profile.displayName ?? "");
        // account progress from other devices merges in, never overwrites
        if (data.progress) applyRemote(data.progress);
      } catch (err) {
        console.warn("[account]", err);
        if (!cancelled) setLoadError("Could not reach the account service. Progress stays safe on this device.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveName(): Promise<boolean> {
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (!trimmed) return false;
    const token = await getIdToken();
    if (!token) return false;
    await apiFetch("/v1/me", { method: "PUT", body: { displayName: trimmed }, token });
    setName(trimmed);
    setNameSaved(true);
    return true;
  }

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    setActionError(null);
    setWorking(true);
    try {
      await saveName();
    } catch (err) {
      console.warn("[account]", err);
      setActionError(errText(err));
    } finally {
      setWorking(false);
    }
  }

  async function issue() {
    setActionError(null);
    setWorking(true);
    try {
      // the certificate carries this exact name, so persist it first
      if (!nameSaved && !(await saveName())) return;
      await syncNow(); // make sure the server has seen all 63 completions
      const token = await getIdToken();
      if (!token) return;
      const issued = await apiFetch<Certificate>("/v1/certificates", { method: "POST", token });
      setCert(issued);
    } catch (err) {
      console.warn("[account]", err);
      setActionError(errText(err));
    } finally {
      setWorking(false);
    }
  }

  const canIssue = allDone && name.trim().length > 0 && !working;
  const issueBlocker = !allDone
    ? `${total - done} mission${total - done === 1 ? "" : "s"} remaining`
    : name.trim().length === 0
      ? "Add the name for the certificate first"
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PixelPanel tone="phos" title="▪ Account" titleAs="h2">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <HudLabel tone="line">{email ?? "signed in"}</HudLabel>
            <PixelButton
              tone="line"
              variant="ghost"
              type="button"
              onClick={() => void useAuth.getState().signOut()}
            >
              Sign out
            </PixelButton>
          </div>
          <div className="flex items-center gap-3">
            <PixelProgress value={done / total} segments={15} className="max-w-64 flex-1" />
            <HudLabel tone={allDone ? "phos" : "line"}>
              {done}/{total} missions
            </HudLabel>
          </div>
          <p className="text-xs text-muted">
            {syncText(syncState, lastSyncedAt)}{" "}
            <button
              type="button"
              onClick={() => void syncNow()}
              className="underline underline-offset-2 hover:text-phos"
            >
              Sync now
            </button>
          </p>
          {loadError && <p className="text-xs text-amber">{loadError}</p>}
          <p className="text-xs text-muted">
            Signing out keeps your progress in this browser.
          </p>
        </div>
      </PixelPanel>

      {cert ? (
        <CertificatePanel cert={cert} />
      ) : (
        <PixelPanel tone={allDone ? "amber" : "line"} title="▪ Certificate" titleAs="h2">
          <div className="flex flex-col gap-4 p-5">
            <form onSubmit={onSaveName} className="flex flex-col gap-2">
              <PixelField
                label="Name on the certificate"
                htmlFor="acct-name"
                hint="Printed on the certificate and shown publicly on its verification page. Once the certificate is issued it can't be changed."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <PixelInput
                    id="acct-name"
                    maxLength={60}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameSaved(false);
                    }}
                    className="min-w-56 flex-1"
                  />
                  <PixelButton tone="line" variant="ghost" type="submit" disabled={working || nameSaved}>
                    {nameSaved ? "Saved" : "Save"}
                  </PixelButton>
                </div>
              </PixelField>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <PixelButton tone="amber" type="button" disabled={!canIssue} onClick={() => void issue()}>
                {working ? "Working" : "Issue certificate"}
              </PixelButton>
              {issueBlocker && <HudLabel tone="line">{issueBlocker}</HudLabel>}
            </div>
            {actionError && (
              <p role="alert" className="text-xs text-crt-red">
                {actionError}
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted">
              Finish all {total} missions and you can issue the certificate: a permanent
              verification link you can add to LinkedIn, plus a signed Open Badges 3.0
              credential.
            </p>
          </div>
        </PixelPanel>
      )}
    </div>
  );
}

function syncText(state: string, lastSyncedAt: string | null): string {
  switch (state) {
    case "syncing":
      return "Syncing progress...";
    case "synced":
      return lastSyncedAt
        ? `Progress synced at ${new Date(lastSyncedAt).toLocaleTimeString()}.`
        : "Progress synced.";
    case "offline":
      return "Offline. Progress will sync when the connection returns.";
    case "error":
      return "Sync hit a snag. It retries on your next completed mission.";
    default:
      return "Progress syncs automatically while you play.";
  }
}

function errText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "incomplete")
      return `The server has not seen every mission yet (${err.missing?.length ?? "some"} missing). Sync and try again.`;
    if (err.code === "display_name_required") return "Add the name for the certificate first.";
    if (err.code === "invalid_display_name") return "That name cannot go on a certificate. Use 1 to 60 normal characters.";
    if (err.code === "network") return "The certification service is unreachable. Try again in a moment.";
  }
  return "Something went wrong. Try again in a moment.";
}
