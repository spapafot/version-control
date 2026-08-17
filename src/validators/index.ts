import type { RepoState } from "@/git/types";
import { headCommit, isReachable, reachableFromHead } from "@/git/queries";

/**
 * Challenge validators: pure predicates over the RepoState snapshot.
 * A challenge passes when ALL of its validators pass - commands are never
 * inspected, so every correct route to the final state counts.
 */
export type ValidatorSpec =
  | { type: "repoInitialized" }
  | { type: "branchExists"; branch: string }
  | { type: "branchMissing"; branch: string }
  | { type: "headIs"; branch: string }
  | { type: "workingTreeClean" }
  | { type: "fileIsStaged"; file: string }
  | { type: "fileNotStaged"; file: string }
  | { type: "fileUntracked"; file: string }
  | { type: "fileModifiedUnstaged"; file: string }
  | { type: "fileUnchanged"; file: string }
  | { type: "fileIsCommitted"; file: string }
  | { type: "fileNotCommitted"; file: string }
  | { type: "commitCount"; count: number; atLeast?: boolean }
  | { type: "branchIsMerged"; branch: string; into: string }
  | { type: "branchNotMerged"; branch: string; into: string }
  | { type: "branchHasFile"; branch: string; file: string }
  | { type: "branchLacksFile"; branch: string; file: string }
  | { type: "commitExistsWithFile"; file: string }
  | { type: "fileContentEquals"; file: string; content: string }
  | { type: "fileContentContains"; file: string; text: string }
  | { type: "fileContentNotContains"; file: string; text: string }
  | { type: "committedContentContains"; file: string; text: string }
  | { type: "mergeCommitExists" }
  | { type: "mergeInProgress" }
  | { type: "noMergeInProgress" }
  | { type: "headMessageContains"; text: string }
  | { type: "fileExists"; file: string }
  | { type: "fileMissing"; file: string }
  | { type: "directoryExists"; dir: string }
  | { type: "directoryMissing"; dir: string }
  | { type: "stashCount"; count: number; atLeast?: boolean }
  | { type: "branchPushed"; branch: string }
  | { type: "trackingUpToDate"; branch: string }
  /** for read-only lessons (status, log) where the repo state cannot change */
  | { type: "ranCommand"; match: string };

export type LabeledValidator = ValidatorSpec & { label?: string };

export interface CheckResult {
  spec: LabeledValidator;
  label: string;
  pass: boolean;
}

export interface Evaluation {
  pass: boolean;
  results: CheckResult[];
}

const normalize = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n+$/, "");

function workdirContent(state: RepoState, file: string): string | null {
  return state.workdir.find((f) => f.path === file)?.content ?? null;
}

function fileStatus(state: RepoState, file: string) {
  return state.status.find((f) => f.path === file);
}

function committedText(state: RepoState, file: string): string | null {
  // validators only need HEAD-tree membership + workdir text; committed text
  // is approximated by "file in HEAD tree and clean in the working copy"
  const st = fileStatus(state, file);
  if (!state.headFiles.includes(file)) return null;
  if (st && (st.staged || st.unstaged)) return null;
  return workdirContent(state, file);
}

const squeeze = (s: string) => s.trim().replace(/\s+/g, " ");

function check(
  spec: ValidatorSpec,
  state: RepoState,
  history: string[],
): boolean {
  switch (spec.type) {
    case "repoInitialized":
      return state.initialized;
    case "branchExists":
      return state.branches.some((b) => b.name === spec.branch);
    case "branchMissing":
      return !state.branches.some((b) => b.name === spec.branch);
    case "headIs":
      return state.head.ref === spec.branch;
    case "workingTreeClean":
      return (
        state.initialized &&
        !state.merge.inProgress &&
        state.status.every(
          (f) => !f.staged && !f.unstaged && !f.untracked && !f.conflicted,
        )
      );
    case "fileIsStaged": {
      const st = fileStatus(state, spec.file);
      return Boolean(st?.staged) && !st?.conflicted;
    }
    case "fileNotStaged":
      return !fileStatus(state, spec.file)?.staged;
    case "fileUntracked":
      return Boolean(fileStatus(state, spec.file)?.untracked);
    case "fileModifiedUnstaged":
      return fileStatus(state, spec.file)?.unstaged === "modified";
    case "fileUnchanged": {
      const st = fileStatus(state, spec.file);
      return (
        state.headFiles.includes(spec.file) &&
        (!st || (!st.staged && !st.unstaged && !st.untracked && !st.conflicted))
      );
    }
    case "fileIsCommitted":
      return state.headFiles.includes(spec.file);
    case "fileNotCommitted":
      return !state.headFiles.includes(spec.file);
    case "commitCount": {
      const n = reachableFromHead(state).length;
      return spec.atLeast ? n >= spec.count : n === spec.count;
    }
    case "branchIsMerged": {
      const from = state.branches.find((b) => b.name === spec.into);
      const target = state.branches.find((b) => b.name === spec.branch);
      if (!from || !target) return false;
      return isReachable(state.commits, from.oid, target.oid);
    }
    case "branchNotMerged": {
      const from = state.branches.find((b) => b.name === spec.into);
      const target = state.branches.find((b) => b.name === spec.branch);
      if (!from || !target) return false;
      return !isReachable(state.commits, from.oid, target.oid);
    }
    case "branchHasFile":
    case "branchLacksFile": {
      const tip = state.branches.find((b) => b.name === spec.branch);
      if (!tip) return false;
      const node = state.commits.find((c) => c.oid === tip.oid);
      const has = Boolean(node?.files.includes(spec.file));
      return spec.type === "branchHasFile" ? has : !has;
    }
    case "commitExistsWithFile":
      return state.commits.some((c) => c.files.includes(spec.file));
    case "fileContentEquals": {
      const c = workdirContent(state, spec.file);
      return c !== null && normalize(c) === normalize(spec.content);
    }
    case "fileContentContains": {
      const c = workdirContent(state, spec.file);
      return c !== null && c.includes(spec.text);
    }
    case "fileContentNotContains": {
      const c = workdirContent(state, spec.file);
      return c !== null && !c.includes(spec.text);
    }
    case "committedContentContains": {
      const c = committedText(state, spec.file);
      return c !== null && c.includes(spec.text);
    }
    case "mergeCommitExists":
      return reachableFromHead(state).some((c) => c.isMerge);
    case "mergeInProgress":
      return state.merge.inProgress;
    case "noMergeInProgress":
      return !state.merge.inProgress;
    case "headMessageContains": {
      const head = headCommit(state);
      return (
        head !== null &&
        head.message.toLowerCase().includes(spec.text.toLowerCase())
      );
    }
    case "fileExists":
      return workdirContent(state, spec.file) !== null;
    case "fileMissing":
      return workdirContent(state, spec.file) === null;
    case "directoryExists":
      return state.dirs.includes(spec.dir.replace(/\/+$/, ""));
    case "directoryMissing":
      return !state.dirs.includes(spec.dir.replace(/\/+$/, ""));
    case "stashCount":
      return spec.atLeast
        ? state.stash.length >= spec.count
        : state.stash.length === spec.count;
    case "branchPushed": {
      const local = state.branches.find((b) => b.name === spec.branch);
      const origin = state.remote?.branches.find((b) => b.name === spec.branch);
      return Boolean(local && origin && local.oid === origin.oid);
    }
    case "trackingUpToDate": {
      const tracking = state.remote?.tracking.find(
        (t) => t.name === spec.branch,
      );
      const origin = state.remote?.branches.find((b) => b.name === spec.branch);
      return Boolean(tracking && origin && tracking.oid === origin.oid);
    }
    case "ranCommand":
      return history.some((line) =>
        squeeze(line).startsWith(squeeze(spec.match)),
      );
  }
}

/** Objective text shown in the mission checklist. */
function defaultLabel(spec: ValidatorSpec): string {
  switch (spec.type) {
    case "repoInitialized":
      return "A git repository exists";
    case "branchExists":
      return `Branch "${spec.branch}" exists`;
    case "branchMissing":
      return `Branch "${spec.branch}" no longer exists`;
    case "headIs":
      return `You are on branch "${spec.branch}"`;
    case "workingTreeClean":
      return "The working tree is clean";
    case "fileIsStaged":
      return `"${spec.file}" is in the staging area`;
    case "fileNotStaged":
      return `"${spec.file}" is not in the staging area`;
    case "fileUntracked":
      return `"${spec.file}" is untracked`;
    case "fileModifiedUnstaged":
      return `Changes to "${spec.file}" remain unstaged`;
    case "fileUnchanged":
      return `"${spec.file}" is back to its original form`;
    case "fileIsCommitted":
      return `"${spec.file}" exists in the latest commit`;
    case "fileNotCommitted":
      return `"${spec.file}" does not exist in the latest commit`;
    case "commitCount":
      return spec.atLeast
        ? `There are at least ${spec.count} commits`
        : `There are exactly ${spec.count} commits`;
    case "branchIsMerged":
      return `"${spec.branch}" has been merged into "${spec.into}"`;
    case "branchNotMerged":
      return `"${spec.branch}" has NOT been merged into "${spec.into}"`;
    case "branchHasFile":
      return `Branch "${spec.branch}" contains "${spec.file}"`;
    case "branchLacksFile":
      return `Branch "${spec.branch}" does not contain "${spec.file}"`;
    case "commitExistsWithFile":
      return `Some commit contains "${spec.file}"`;
    case "fileContentEquals":
    case "fileContentContains":
      return `"${spec.file}" has the right content`;
    case "fileContentNotContains":
      return `"${spec.file}" does not contain "${spec.text.length > 12 ? spec.text.slice(0, 12) + "…" : spec.text}"`;
    case "committedContentContains":
      return `The correct version of "${spec.file}" has been committed`;
    case "mergeCommitExists":
      return "A merge commit exists in the history";
    case "mergeInProgress":
      return "A merge is in progress";
    case "noMergeInProgress":
      return "No merge is pending";
    case "headMessageContains":
      return `The commit message mentions "${spec.text}"`;
    case "fileExists":
      return `File "${spec.file}" exists`;
    case "fileMissing":
      return `File "${spec.file}" does not exist`;
    case "directoryExists":
      return `Folder "${spec.dir}" exists`;
    case "directoryMissing":
      return `Folder "${spec.dir}" is gone`;
    case "stashCount":
      if (spec.count === 0) return "The stash is empty";
      return spec.atLeast
        ? `The stash holds at least ${spec.count} ${spec.count === 1 ? "entry" : "entries"}`
        : `The stash holds exactly ${spec.count} ${spec.count === 1 ? "entry" : "entries"}`;
    case "branchPushed":
      return `origin has the latest "${spec.branch}"`;
    case "trackingUpToDate":
      return `"origin/${spec.branch}" matches the remote`;
    case "ranCommand":
      return `You ran "${spec.match}"`;
  }
}

export function evaluate(
  specs: LabeledValidator[],
  state: RepoState,
  history: string[] = [],
): Evaluation {
  const results = specs.map((spec) => ({
    spec,
    label: spec.label ?? defaultLabel(spec),
    pass: check(spec, state, history),
  }));
  return { pass: results.length > 0 && results.every((r) => r.pass), results };
}
