import * as git from "isomorphic-git";
import type { GitEngine } from "./engine";
import type { CommitNode, FileStatus, RepoState } from "./types";
import { EMPTY_REPO_STATE } from "./types";

/**
 * The single snapshot read after every command. Feeds the git graph, the
 * file/staging panels, and the challenge validators.
 */
export async function buildRepoState(engine: GitEngine): Promise<RepoState> {
  if (!(await engine.isInitialized())) {
    return { ...EMPTY_REPO_STATE, workdir: await readWorkdir(engine) };
  }

  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };

  const branchNames = await git.listBranches(common);
  const branches: Array<{ name: string; oid: string }> = [];
  for (const name of branchNames) {
    branches.push({
      name,
      oid: await git.resolveRef({ ...common, ref: `refs/heads/${name}` }),
    });
  }

  const headRef = (await git.currentBranch({ ...common, fullname: false })) ?? null;
  let headOid: string | null = null;
  try {
    headOid = await git.resolveRef({ ...common, ref: "HEAD" });
  } catch {
    // unborn HEAD (fresh init)
  }

  const tips = [...new Set([...branches.map((b) => b.oid), ...(headOid ? [headOid] : [])])];
  const commits = await walkCommits(engine, tips, branches);

  const conflicted = new Set(engine.mergeState?.conflicted ?? []);
  const matrix = await git.statusMatrix(common);
  const status = matrix
    .map((row) => classifyRow(row, conflicted))
    .filter((s): s is FileStatus => s !== null);

  let headFiles: string[] = [];
  if (headOid) headFiles = await git.listFiles({ ...common, ref: headOid });

  return {
    initialized: true,
    head: { ref: headRef, oid: headOid },
    branches,
    commits,
    status,
    headFiles,
    workdir: await readWorkdir(engine),
    merge: {
      inProgress: engine.mergeState !== null,
      theirs: engine.mergeState?.theirsRef,
      conflicted: engine.mergeState ? [...engine.mergeState.conflicted] : undefined,
    },
    stash: engine.stash.map((e) => ({ label: e.label, files: e.files.map((f) => f.path) })),
  };
}

function classifyRow(
  row: [string, 0 | 1, 0 | 1 | 2, 0 | 1 | 2 | 3],
  conflictedSet: Set<string>,
): FileStatus | null {
  const [path, head, workdir, stage] = row;
  const s: FileStatus = {
    path,
    staged: null,
    unstaged: null,
    untracked: false,
    conflicted: conflictedSet.has(path),
  };
  if (s.conflicted) return s;

  if (head === 0) {
    if (stage === 0) {
      if (workdir === 2) s.untracked = true;
      else return null; // ghost row
    } else {
      s.staged = "added";
      if (workdir === 0) s.unstaged = "deleted";
      else if (stage === 3) s.unstaged = "modified";
    }
  } else {
    // tracked in HEAD
    if (stage === 0) {
      s.staged = "deleted";
      if (workdir === 2) s.untracked = true; // deleted from index, recreated on disk
    } else {
      if (stage === 2 || stage === 3) s.staged = "modified";
      if (workdir === 0) s.unstaged = "deleted";
      else if (workdir === 2 && (stage === 1 || stage === 3)) s.unstaged = "modified";
    }
  }
  return s;
}

async function walkCommits(
  engine: GitEngine,
  tips: string[],
  branches: Array<{ name: string; oid: string }>,
): Promise<CommitNode[]> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };
  const seen = new Map<string, CommitNode>();
  const queue = [...tips];

  while (queue.length > 0) {
    const oid = queue.shift()!;
    if (seen.has(oid)) continue;
    const { commit } = await git.readCommit({ ...common, oid });
    seen.set(oid, {
      oid,
      message: commit.message.replace(/\n+$/, ""),
      parents: commit.parent,
      author: {
        name: commit.author.name,
        email: commit.author.email,
        timestamp: commit.author.timestamp,
      },
      refs: branches.filter((b) => b.oid === oid).map((b) => b.name),
      isMerge: commit.parent.length > 1,
      files: await git.listFiles({ ...common, ref: oid }),
    });
    queue.push(...commit.parent);
  }

  // newest first; BFS insertion order (children before parents) breaks timestamp ties
  const order = [...seen.keys()];
  return [...seen.values()].sort(
    (a, b) =>
      b.author.timestamp - a.author.timestamp ||
      order.indexOf(a.oid) - order.indexOf(b.oid),
  );
}

async function readWorkdir(
  engine: GitEngine,
): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  await walkDir(engine, engine.dir, "", out);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function walkDir(
  engine: GitEngine,
  absDir: string,
  relPrefix: string,
  out: Array<{ path: string; content: string }>,
): Promise<void> {
  let entries: string[];
  try {
    entries = await engine.fsp.promises.readdir(absDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === ".git") continue;
    const abs = `${absDir}/${entry}`;
    const rel = relPrefix ? `${relPrefix}/${entry}` : entry;
    const stat = await engine.fsp.promises.stat(abs);
    if (stat.isDirectory()) {
      await walkDir(engine, abs, rel, out);
    } else {
      out.push({ path: rel, content: await engine.fsp.promises.readFile(abs, "utf8") });
    }
  }
}
