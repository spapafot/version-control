export interface Persona {
  name: string;
  email: string;
}

export interface CommitNode {
  oid: string;
  message: string;
  parents: string[];
  author: Persona & { timestamp: number };
  /** branch names whose tip is this commit (remote-tracking as "origin/x") */
  refs: string[];
  isMerge: boolean;
  /** paths present in this commit's tree */
  files: string[];
}

export interface FileStatus {
  path: string;
  /** index vs HEAD */
  staged: "added" | "modified" | "deleted" | null;
  /** workdir vs index */
  unstaged: "modified" | "deleted" | null;
  untracked: boolean;
  conflicted: boolean;
}

export interface RemoteState {
  /** origin's ACTUAL refs/heads — the ground truth validators check against */
  branches: Array<{ name: string; oid: string }>;
  /** local refs/remotes/origin/* — what fetch/push move; feeds graph + status */
  tracking: Array<{ name: string; oid: string }>;
  /** current branch vs its tracking ref; null when HEAD has no tracking ref */
  ahead: number | null;
  behind: number | null;
}

export interface RepoState {
  initialized: boolean;
  head: { ref: string | null; oid: string | null };
  branches: Array<{ name: string; oid: string }>;
  /** BFS from all branch tips + HEAD + remote-tracking tips, newest first */
  commits: CommitNode[];
  status: FileStatus[];
  /** paths in the HEAD tree */
  headFiles: string[];
  workdir: Array<{ path: string; content: string }>;
  /** every directory under the root (`.git` excluded), sorted, no trailing slash */
  dirs: string[];
  merge: { inProgress: boolean; theirs?: string; conflicted?: string[] };
  /** stash stack, newest first (stash@{0}) */
  stash: Array<{ label: string; files: string[] }>;
  /** the simulated origin, when the challenge published one */
  remote: RemoteState | null;
}

export type MergeOutcome =
  | { kind: "fast-forward"; oid: string }
  | { kind: "merge-commit"; oid: string }
  | { kind: "already-up-to-date" }
  | { kind: "conflict"; conflicted: string[] };

export interface MergeState {
  theirsRef: string;
  theirsOid: string;
  oursOid: string;
  /** shrinks as the user `git add`s resolved files */
  conflicted: Set<string>;
  message: string;
}

export const EMPTY_REPO_STATE: RepoState = {
  initialized: false,
  head: { ref: null, oid: null },
  branches: [],
  commits: [],
  status: [],
  headFiles: [],
  workdir: [],
  dirs: [],
  merge: { inProgress: false },
  stash: [],
  remote: null,
};
