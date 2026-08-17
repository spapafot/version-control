import { create } from "zustand";
import { GitEngine } from "@/git/engine";
import { createMemFs } from "@/git/fs";
import { runSetup } from "@/git/setup";
import type { RepoState } from "@/git/types";
import { Shell, type ShellIO } from "@/terminal/shell";
import { challengeBySlug, type ChallengeDefinition } from "@/challenges";
import { evaluate, type Evaluation } from "@/validators";

interface GameStore {
  /** null slug = playground */
  slug: string | null;
  challenge: ChallengeDefinition | null;
  engine: GitEngine | null;
  shell: Shell | null;
  state: RepoState | null;
  history: string[];
  evaluation: Evaluation | null;
  completed: boolean;
  hintsShown: number;
  /** bumps on every (re)load - terminal remounts on change */
  sessionId: number;
  /** file open in the editor modal */
  editingFile: string | null;

  loadChallenge(slug: string): Promise<void>;
  loadPlayground(): Promise<void>;
  reset(): Promise<void>;
  execute(line: string, io: ShellIO): Promise<number>;
  refreshAfterEdit(): Promise<void>;
  revealHint(): void;
  openEditor(path: string): void;
  closeEditor(): void;
  dismissOverlay(): void;
  overlayDismissed: boolean;
}

export const useGame = create<GameStore>((set, get) => ({
  slug: null,
  challenge: null,
  engine: null,
  shell: null,
  state: null,
  history: [],
  evaluation: null,
  completed: false,
  hintsShown: 0,
  sessionId: 0,
  editingFile: null,
  overlayDismissed: false,

  async loadChallenge(slug) {
    const challenge = challengeBySlug.get(slug) ?? null;
    const engine = new GitEngine(createMemFs());
    if (challenge) await runSetup(engine, challenge.setup);
    const shell = new Shell(engine);
    const state = await engine.snapshot();
    set({
      slug,
      challenge,
      engine,
      shell,
      state,
      history: [],
      evaluation: challenge ? evaluate(challenge.validators, state, []) : null,
      completed: false,
      hintsShown: 0,
      sessionId: get().sessionId + 1,
      editingFile: null,
      overlayDismissed: false,
    });
  },

  async loadPlayground() {
    const engine = new GitEngine(createMemFs());
    const shell = new Shell(engine);
    const state = await engine.snapshot();
    set({
      slug: null,
      challenge: null,
      engine,
      shell,
      state,
      history: [],
      evaluation: null,
      completed: false,
      hintsShown: 0,
      sessionId: get().sessionId + 1,
      editingFile: null,
      overlayDismissed: false,
    });
  },

  async reset() {
    const { slug } = get();
    if (slug) await get().loadChallenge(slug);
    else await get().loadPlayground();
  },

  async execute(line, io) {
    const { shell, engine, challenge, history, completed } = get();
    if (!shell || !engine) return 0;
    const code = await shell.execute(line, io);
    const nextHistory = [...history, line];
    const state = await engine.snapshot();
    const evaluation = challenge
      ? evaluate(challenge.validators, state, nextHistory)
      : null;
    set({
      state,
      history: nextHistory,
      evaluation,
      completed: completed || Boolean(evaluation?.pass),
    });
    return code;
  },

  async refreshAfterEdit() {
    const { engine, challenge, history, completed } = get();
    if (!engine) return;
    const state = await engine.snapshot();
    const evaluation = challenge
      ? evaluate(challenge.validators, state, history)
      : null;
    set({
      state,
      evaluation,
      completed: completed || Boolean(evaluation?.pass),
    });
  },

  revealHint() {
    const { hintsShown, challenge } = get();
    if (!challenge) return;
    set({ hintsShown: Math.min(hintsShown + 1, challenge.hints.length) });
  },

  openEditor(path) {
    set({ editingFile: path });
  },
  closeEditor() {
    set({ editingFile: null });
  },
  dismissOverlay() {
    set({ overlayDismissed: true });
  },
}));
