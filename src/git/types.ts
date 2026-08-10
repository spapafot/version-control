export interface Persona {
  name: string;
  email: string;
}

export interface CommitNode {
  oid: string;
  message: string;
  parents: string[];
  author: Persona & { timestamp: number };
  /** branch names whose tip is this commit */
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

export interface RepoState {
  initialized: boolean;
  head: { ref: string | null; oid: string | null };
  branches: Array<{ name: string; oid: string }>;
  /** BFS from all branch tips + HEAD, newest first */
  commits: CommitNode[];
  status: FileStatus[];
  /** paths in the HEAD tree */
  headFiles: string[];
  workdir: Array<{ path: string; content: string }>;
  merge: { inProgress: boolean; theirs?: string; conflicted?: string[] };
  /** stash stack, newest first (stash@{0}) */
  stash: Array<{ label: string; files: string[] }>;
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
  merge: { inProgress: false },
  stash: [],
};
