import { create } from "zustand";
import { ApiError } from "./api";
import { getIdTokenIfSignedIn } from "./auth";
import { useQuizLocal } from "./quiz-local";
import {
  startQuiz,
  submitQuiz,
  type QuizMode,
  type QuizResult,
  type QuizSession,
} from "./quiz-api";

/**
 * Session state for one quiz run. Not persisted, like game-store: a reload
 * abandons the run, which is the honest behaviour for something timed. The
 * server holds the questions and the clock; this store holds only what the
 * player has picked so far.
 */

export type QuizPhase =
  | "hub"
  | "loading"
  | "running"
  | "submitting"
  | "results"
  | "error";

interface QuizStore {
  phase: QuizPhase;
  /** current selection on the hub, kept across runs */
  mode: QuizMode;
  session: QuizSession | null;
  /** question index being shown */
  index: number;
  /** question id -> chosen option, as displayed */
  answers: Record<string, number>;
  result: QuizResult | null;
  error: string | null;
  /** serverNow minus client clock at hand-out; keeps a skewed clock honest */
  clockOffsetMs: number;
  expiresAtMs: number;
  /** true when this run set a new device-local best */
  localBest: boolean;

  setMode(mode: QuizMode): void;
  start(): Promise<void>;
  choose(questionId: string, choice: number): void;
  goTo(index: number): void;
  next(): void;
  prev(): void;
  finish(): Promise<void>;
  backToHub(): void;
}

/** Guards against a double submit from the timer and a click racing. */
let submitting: Promise<void> | null = null;

export const useQuiz = create<QuizStore>((set, get) => ({
  phase: "hub",
  mode: "set20",
  session: null,
  index: 0,
  answers: {},
  result: null,
  error: null,
  clockOffsetMs: 0,
  expiresAtMs: 0,
  localBest: false,

  setMode: (mode) => set({ mode }),

  start: async () => {
    const { mode } = get();
    set({ phase: "loading", error: null, result: null, answers: {}, index: 0 });
    try {
      const token = (await getIdTokenIfSignedIn()) ?? undefined;
      const session = await startQuiz(mode, token);
      // Treat the round trip as time already spent: measuring the offset at
      // receipt makes the client's clock slightly stricter than the server's,
      // never more generous.
      const offset = Date.parse(session.serverNow) - Date.now();
      set({
        phase: "running",
        session,
        clockOffsetMs: offset,
        expiresAtMs: Date.parse(session.expiresAt),
      });
    } catch (err) {
      set({ phase: "error", error: describe(err) });
    }
  },

  choose: (questionId, choice) => {
    const { session, answers, index, phase } = get();
    if (phase !== "running" || session === null) return;
    const next = { ...answers, [questionId]: choice };
    set({ answers: next });

    const questions = session.questions;
    if (Object.keys(next).length >= questions.length) {
      // Pool cleared: nothing left to answer, so submit rather than stall.
      void get().finish();
      return;
    }
    // Move on straight away: in a timed run, waiting for a second click is just
    // lost seconds. Search forward and wrap, so skipped questions come back
    // around instead of being stranded. Going back is still possible via the nav.
    for (let step = 1; step <= questions.length; step++) {
      const candidate = (index + step) % questions.length;
      if (next[questions[candidate].id] === undefined) {
        set({ index: candidate });
        return;
      }
    }
  },

  goTo: (index) => {
    const session = get().session;
    if (session === null) return;
    set({ index: Math.max(0, Math.min(index, session.questions.length - 1)) });
  },
  next: () => get().goTo(get().index + 1),
  prev: () => get().goTo(get().index - 1),

  finish: async () => {
    if (submitting !== null) return submitting;
    const { session, answers, phase } = get();
    if (session === null || (phase !== "running" && phase !== "loading")) return;

    submitting = (async () => {
      set({ phase: "submitting" });
      try {
        const token = (await getIdTokenIfSignedIn()) ?? undefined;
        const result = await submitQuiz(
          session.sessionId,
          Object.entries(answers).map(([id, choice]) => ({ id, choice })),
          token,
        );
        const localBest = useQuizLocal.getState().recordRun(session.mode, {
          score: result.score,
          total: result.total,
          elapsedMs: result.elapsedMs,
          at: new Date().toISOString(),
        });
        set({ phase: "results", result, localBest });
      } catch (err) {
        set({ phase: "error", error: describe(err) });
      } finally {
        submitting = null;
      }
    })();
    return submitting;
  },

  backToHub: () =>
    set({
      phase: "hub",
      session: null,
      answers: {},
      index: 0,
      result: null,
      error: null,
      localBest: false,
    }),
}));

/** Milliseconds left on the server's clock, as best this client can tell. */
export function remainingMs(state: Pick<QuizStore, "expiresAtMs" | "clockOffsetMs">): number {
  return Math.max(0, state.expiresAtMs - (Date.now() + state.clockOffsetMs));
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "network":
        return "The quiz service is unreachable. Check your connection and try again.";
      case "bank_unavailable":
        return "The question bank is not available right now. Try again shortly.";
      case "already_submitted":
        return "That run had already been submitted.";
      case "session_not_found":
        return "That run has expired. Start a new one.";
      case "not_your_session":
        return "That run belongs to a different account.";
      case "unauthorized":
        return "Your session has expired. Sign in again to keep your place on the board.";
      default:
        return err.message;
    }
  }
  return "Something went wrong. Try again.";
}
