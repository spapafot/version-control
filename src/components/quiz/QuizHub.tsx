"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GameHeader } from "@/components/layout/GameHeader";
import { HudLabel, PixelButton, PixelPanel } from "@/components/ui/pixel";
import { getIdTokenIfSignedIn, hasStoredSession } from "@/lib/auth";
import {
  fetchQuizMe,
  formatElapsed,
  MODE_BLURBS,
  MODE_LABELS,
  QUIZ_MODES,
} from "@/lib/quiz-api";
import { bestKey, useQuizLocal, useQuizLocalHydrated } from "@/lib/quiz-local";
import { useQuiz } from "@/lib/quiz-store";
import { NicknamePrompt } from "./NicknamePrompt";
import { QuizLeaderboard } from "./QuizLeaderboard";

/** null = unknown or not signed in, "" = signed in but not chosen yet. */
type NicknameState = string | null;

function Choice({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick(): void;
  title: string;
  detail?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-corners flex-1 p-[2px] text-left transition-transform active:translate-y-[2px] ${
        active ? "bg-phos-dim" : "bg-line"
      }`}
    >
      <span
        className={`px-corners flex h-full flex-col gap-1 px-3 py-2.5 ${
          active ? "bg-raised" : "bg-raised hover:bg-line/60"
        }`}
      >
        {/* text-[11px] is the site's one label size, shared with HudLabel and
            the panel titles above. Anything larger reads as a second font. */}
        <span className={`hud text-[11px] ${active ? "text-phos" : "text-fg"}`}>
          {title}
        </span>
        {detail !== undefined && (
          <span className="text-xs leading-snug text-muted">{detail}</span>
        )}
      </span>
    </button>
  );
}

export function QuizHub() {
  const mode = useQuiz((s) => s.mode);
  const setMode = useQuiz((s) => s.setMode);
  const ranked = useQuiz((s) => s.ranked);
  const setRanked = useQuiz((s) => s.setRanked);
  const start = useQuiz((s) => s.start);
  const phase = useQuiz((s) => s.phase);
  const error = useQuiz((s) => s.error);

  const bests = useQuizLocal((s) => s.bests);
  const runs = useQuizLocal((s) => s.runs);
  // The prerender has no localStorage, so a stored best must wait for hydration
  // or it renders empty and then flips.
  const hydrated = useQuizLocalHydrated();
  const best = hydrated ? bests[bestKey(mode)] : undefined;

  // Signed-in players need a nickname before a score can go on a board. The
  // hasStoredSession probe reads the key Amplify writes, so an anonymous
  // visitor never downloads the auth chunk just to be told none of this applies.
  const [nickname, setNicknameState] = useState<NicknameState>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!hasStoredSession()) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getIdTokenIfSignedIn();
        if (token === null || cancelled) return;
        const me = await fetchQuizMe(token);
        if (cancelled) return;
        setSignedIn(true);
        setNicknameState(me.nickname ?? "");
      } catch {
        // Not fatal: without this the player simply plays unranked, and the
        // results screen explains why.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const needsNickname = signedIn && nickname === "";

  return (
    // No min-h-dvh here, unlike the run and results screens: the hub is short
    // and the About section sits directly below it on the page, so forcing full
    // viewport height would only open a gap between the two.
    <div className="flex flex-col bg-ink">
      <GameHeader />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5">
        <PixelPanel tone="phos" title="▪ Git quiz">
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
              <HudLabel tone="line">Mode</HudLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                {QUIZ_MODES.map((m) => (
                  <Choice
                    key={m}
                    active={m === mode}
                    onClick={() => setMode(m)}
                    title={MODE_LABELS[m]}
                    detail={MODE_BLURBS[m]}
                  />
                ))}
              </div>
            </div>

            {/* Signed out, every run is already unranked and this would change
                nothing, so the nudge below does the explaining instead. And while
                the nickname prompt is up there is no Start button to qualify. */}
            {signedIn && !needsNickname && (
              <div className="flex flex-col gap-2">
                <HudLabel tone="line">Leaderboard</HudLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Choice
                    active={ranked}
                    onClick={() => setRanked(true)}
                    title="Ranked"
                    detail="Beat your best and it goes on the board."
                  />
                  <Choice
                    active={!ranked}
                    onClick={() => setRanked(false)}
                    title="Practice"
                    detail="Scored and reviewed, but kept off the board."
                  />
                </div>
              </div>
            )}

            {error !== null && (
              <p role="alert" className="text-sm text-crt-red">
                {error}
              </p>
            )}

            {needsNickname ? (
              <NicknamePrompt
                onSaved={(saved) => {
                  setNicknameState(saved);
                  void start();
                }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <PixelButton
                  tone="phos"
                  onClick={() => void start()}
                  disabled={phase === "loading"}
                >
                  {phase === "loading" ? "Dealing…" : "▸ Start"}
                </PixelButton>
                {best !== undefined && (
                  <HudLabel tone="line">
                    Your best: {best.score}
                    {mode === "sprint" ? " correct" : `/${best.total}`}
                  </HudLabel>
                )}
                {hydrated && runs > 0 && best === undefined && (
                  <HudLabel tone="line">No run yet in this mode</HudLabel>
                )}
                {nickname !== null && nickname !== "" && (
                  <HudLabel tone="line">Playing as {nickname}</HudLabel>
                )}
              </div>
            )}

            {/* Only worth saying to someone who is not already signed in. */}
            {!signedIn && (
              <p className="text-xs text-muted">
                Want to see how you compare to other players? Sign up to save your
                rankings!
              </p>
            )}
          </div>
        </PixelPanel>

        {/* runs increments on every finished run, which is what tells the board
            to fetch past the browser's cached copy rather than show the score
            from before this run. */}
        <QuizLeaderboard selectedMode={mode} refreshToken={runs} />

        <nav
          aria-label="Course links"
          className="flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs"
        >
          <Link
            prefetch={false}
            href="/stages/"
            className="text-amber hover:text-phos"
          >
            All missions →
          </Link>
          <Link
            prefetch={false}
            href="/cheatsheet/"
            className="text-muted hover:text-phos"
          >
            Cheat sheet
          </Link>
          <Link
            prefetch={false}
            href="/playground/"
            className="text-muted hover:text-phos"
          >
            Git playground
          </Link>
        </nav>
      </main>
    </div>
  );
}
