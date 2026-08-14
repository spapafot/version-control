import * as git from "isomorphic-git";
import type { GitEngine } from "./engine";
import type { CommitNode, FileStatus, RemoteState, RepoState } from "./types";
import { EMPTY_REPO_STATE } from "./types";
import { aheadBehind } from "./queries";

/**
 * The single snapshot read after every command. Feeds the git graph, the
 * file/staging panels, and the challenge validators.
 */
export async function buildRepoState(engine: GitEngine): Promise<RepoState> {
  if (!(await engine.isInitialized())) {
    return { ...EMPTY_REPO_STATE, ...(await readWorkdir(engine)) };
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

  const remote = await readRemote(engine);

  // tips include TRACKING oids only, never origin's actual tips: their objects
  // may not exist locally before a fetch (and "what you fetched" is the correct
  // git knowledge model for the graph anyway)
  const tips = [
    ...new Set([
      ...branches.map((b) => b.oid),
      ...(headOid ? [headOid] : []),
      ...(remote?.tracking.map((t) => t.oid) ?? []),
    ]),
  ];
  const refSources = [
    ...branches,
    ...(remote?.tracking.map((t) => ({ name: `origin/${t.name}`, oid: t.oid })) ?? []),
  ];
  const commits = await walkCommits(engine, tips, refSources);

  if (remote && headRef && headOid) {
    const trackingTip = remote.tracking.find((t) => t.name === headRef);
    if (trackingTip) {
      const counts = aheadBehind(commits, headOid, trackingTip.oid);
      remote.ahead = counts.ahead;
      remote.behind = counts.behind;
    }
  }

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
    ...(await readWorkdir(engine)),
    merge: {
      inProgress: engine.mergeState !== null,
      theirs: engine.mergeState?.theirsRef,
      conflicted: engine.mergeState ? [...engine.mergeState.conflicted] : undefined,
    },
    stash: engine.stash.map((e) => ({ label: e.label, files: e.files.map((f) => f.path) })),
    remote,
  };
}

async function readRemote(engine: GitEngine): Promise<RemoteState | null> {
  const origin = engine.remote;
  if (!origin) return null;
  const originCommon = { fs: origin.fsp.fs, dir: origin.dir, cache: origin.cache };
  const localCommon = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };

  const branches: Array<{ name: string; oid: string }> = [];
  for (const name of await git.listBranches(originCommon)) {
    branches.push({ name, oid: await git.resolveRef({ ...originCommon, ref: `refs/heads/${name}` }) });
  }
  const tracking: Array<{ name: string; oid: string }> = [];
  for (const name of await git.listBranches({ ...localCommon, remote: "origin" })) {
    if (name === "HEAD") continue;
    tracking.push({
      name,
      oid: await git.resolveRef({ ...localCommon, ref: `refs/remotes/origin/${name}` }),
    });
  }
  return { branches, tracking, ahead: null, behind: null };
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
): Promise<{ workdir: Array<{ path: string; content: string }>; dirs: string[] }> {
  const out: Array<{ path: string; content: string }> = [];
  const dirs: string[] = [];
  await walkDir(engine, engine.dir, "", out, dirs);
  return {
    workdir: out.sort((a, b) => a.path.localeCompare(b.path)),
    dirs: dirs.sort((a, b) => a.localeCompare(b)),
  };
}

async function walkDir(
  engine: GitEngine,
  absDir: string,
  relPrefix: string,
  out: Array<{ path: string; content: string }>,
  dirs: string[],
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
      dirs.push(rel);
      await walkDir(engine, abs, rel, out, dirs);
    } else {
      out.push({ path: rel, content: await engine.fsp.promises.readFile(abs, "utf8") });
    }
  }
}
