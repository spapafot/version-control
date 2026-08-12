import { apiFetch } from "./api";

/**
 * Typed client for the quiz endpoints.
 *
 * These types are declared here rather than imported from src/quiz because the
 * question bank is gitignored authoring content that the browser must never
 * see: the quiz is scored server-side, so the UI only ever handles what the API
 * chooses to send it. Nothing under src/quiz is imported by app code.
 *
 * Difficulty appears nowhere below on purpose. Questions still carry a tier in
 * the bank, where it balances the draw, but a player neither picks it nor sees
 * it.
 */

export type QuizMode = "sprint" | "set20";
export type QuizPeriod = "ALL" | "WEEK";

export const QUIZ_MODES: QuizMode[] = ["sprint", "set20"];

export const MODE_LABELS: Record<QuizMode, string> = {
  sprint: "Sprint",
  set20: "Set of 20",
};

export const MODE_BLURBS: Record<QuizMode, string> = {
  sprint: "Three minutes. Answer as many as you can.",
  set20: "Twenty questions, and your time breaks ties.",
};

export interface QuizQuestion {
  id: string;
  topic: string | null;
  prompt: string;
  /** in the order they should be shown; the correct one is not marked */
  options: string[];
}

export interface QuizSession {
  sessionId: string;
  mode: QuizMode;
  total: number;
  durationMs: number;
  /** server clock when the run was handed out, for correcting client skew */
  serverNow: string;
  expiresAt: string;
  questions: QuizQuestion[];
}

export interface QuizReviewItem {
  id: string;
  topic: string | null;
  prompt: string;
  options: string[];
  /** the option this player picked, or null if they never got to it */
  chosen: number | null;
  correct: number;
  explanation: string;
  challenge: string | null;
}

/** Why a run is not on a board. Mirrors quiz.rank_verdict on the server. */
export type RankReason =
  | "opted_out"
  | "anonymous"
  | "expired"
  | "too_short"
  | "no_answers"
  | "no_nickname";

export interface QuizResult {
  score: number;
  total: number;
  answered: number;
  elapsedMs: number;
  mode: QuizMode;
  ranked: boolean;
  rankReason: RankReason | null;
  personalBest: boolean;
  review: QuizReviewItem[];
}

export interface LeaderboardRow {
  rank: number;
  /** the player's nickname, not the name on their certificate */
  name: string;
  score: number;
  total: number;
  elapsedMs: number;
  at: string;
}

export interface Leaderboard {
  mode: QuizMode;
  period: QuizPeriod;
  rows: LeaderboardRow[];
}

export interface QuizBest {
  mode: QuizMode;
  period: string;
  score: number;
  total: number;
  elapsedMs: number;
  at: string;
}

export interface QuizMe {
  bests: QuizBest[];
  stats: { attempts: number; answered: number; correct: number };
  /** null until the player picks one; ranking needs it */
  nickname: string | null;
}

export interface SubmittedAnswer {
  id: string;
  choice: number;
}

export function startQuiz(mode: QuizMode, token?: string): Promise<QuizSession> {
  return apiFetch<QuizSession>("/v1/quiz/sessions", {
    method: "POST",
    body: { mode },
    token,
  });
}

export function submitQuiz(
  sessionId: string,
  answers: SubmittedAnswer[],
  token?: string,
  /** false for a practice run or a mid-run quit: scored and reviewed, not boarded */
  rank = true,
): Promise<QuizResult> {
  return apiFetch<QuizResult>(
    `/v1/quiz/sessions/${encodeURIComponent(sessionId)}/submit`,
    { method: "POST", body: { answers, rank }, token },
  );
}

export function fetchLeaderboard(
  mode: QuizMode,
  period: QuizPeriod,
  limit = 25,
  /** true straight after a run, so the board is not answered from cache */
  fresh = false,
): Promise<Leaderboard> {
  return apiFetch<Leaderboard>(
    `/v1/quiz/leaderboard?mode=${mode}&period=${period}&limit=${limit}`,
    { noStore: fresh },
  );
}

export function fetchQuizMe(token: string): Promise<QuizMe> {
  return apiFetch<QuizMe>("/v1/quiz/me", { token, noStore: true });
}

/** Set the name shown on the leaderboards. Leaves the certificate name alone. */
export function setNickname(nickname: string, token: string): Promise<unknown> {
  return apiFetch("/v1/me", { method: "PUT", body: { nickname }, token });
}

/** m:ss, the way a stopwatch reads. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/** What to tell a player whose run did not make the board. */
export function rankReasonMessage(reason: RankReason): string {
  switch (reason) {
    case "anonymous":
      return "Sign in to put this score on the leaderboard.";
    case "no_nickname":
      return "Pick a nickname to appear on the leaderboard.";
    case "expired":
      return "The clock had run out, so this run is not ranked.";
    case "too_short":
      return "That run was too short to rank.";
    case "opted_out":
      return "Practice run, so it is not on the leaderboard.";
    case "no_answers":
      return "No answers, so there is nothing to rank.";
  }
}
