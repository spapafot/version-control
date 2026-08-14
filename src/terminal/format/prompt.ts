import type { RepoState } from "@/git/types";
import { painter } from "./color";

/**
 * `(main) $ ` — the shell prompt, carrying the current branch the way Git Bash
 * does: cyan, in parentheses, in front of the sigil.
 *
 * "Which branch am I on" is the question every branching mission turns on, and
 * a learner who has to run `git branch` to answer it never builds the habit of
 * reading it off the prompt — which is where they will read it for the rest of
 * their career. Kept to ONE line and one segment (no user@host, no path: the
 * path is always /repo) because the terminal shares a viewport with the graph
 * and the file panels, and the input line has to stay short enough not to wrap.
 *
 * The prompt is rebuilt on every render, so it follows `git switch` for free.
 */
export function renderPrompt(state: RepoState | null): string {
  const paint = painter(true);
  const label = branchLabel(state);
  const branch = label ? `${paint("cyan", `(${label})`)} ` : "";
  return `${branch}${paint("green", "$")} `;
}

/** null before `git init`, where a branch segment would be a lie */
function branchLabel(state: RepoState | null): string | null {
  if (!state?.initialized) return null;
  if (state.head.ref) return state.head.ref;
  // detached HEAD, spelled as Git Bash spells it: ((a1b2c3d...))
  return state.head.oid ? `(${state.head.oid.slice(0, 7)}...)` : null;
}
