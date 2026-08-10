import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";

/**
 * `git stash` — implemented on primitives, like the rest of `ops/`.
 *
 * isomorphic-git 1.41 ships a native `git.stash`, and we deliberately do NOT
 * use it: it restores files with raw fs writes (racy index — see AGENTS.md),
 * stamps `new Date()` into its intermediate commit messages (so setup stashes
 * would not be reproducible), and takes no `cache` parameter.
 *
 * Entries live in memory on the engine, like the reflog. They are never part of
 * the graph anyway (buildRepoState walks branch tips + HEAD), so real commit
 * objects in `refs/stash` would buy nothing.
 */

export interface StashedFile {
  path: string;
  /** working-tree text when stashed; null = the file was gone from the tree */
  workdir: string | null;
  /** was untracked when stashed (only ever true with -u) */
  untracked: boolean;
}

export interface StashEntry {
  /** hashBlob of the payload: deterministic, real 40-hex, no object written */
  oid: string;
  /** `WIP on main: 1a2b3c4 Menu restructure` or `On main: <message>` */
  label: string;
  branch: string | null;
  headOid: string;
  files: StashedFile[];
}

export interface StashPushResult {
  saved: boolean;
  entry?: StashEntry;
}

export async function stashPush(
  engine: GitEngine,
  opts: { message?: string; includeUntracked?: boolean } = {},
): Promise<StashPushResult> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };

  if (engine.mergeState) {
    throw new GitOpError(
      "fatal: git stash is not supported in the middle of a merge in this environment.\n" +
        'hint: finish the merge, or abort it with "git merge --abort", and try again.',
    );
  }

  let headOid: string;
  try {
    headOid = await engine.resolve("HEAD");
  } catch {
    throw new GitOpError("You do not have the initial commit yet", 1);
  }

  const matrix = await engine.statusMatrix();
  const candidates = matrix.filter(([, head, workdir, stage]) => {
    if (head === 1 && workdir === 1 && stage === 1) return false; // unchanged
    const untracked = head === 0 && stage === 0;
    if (untracked) return workdir === 2 && Boolean(opts.includeUntracked);
    return true;
  });
  if (candidates.length === 0) return { saved: false };

  const files: StashedFile[] = [];
  for (const [path, head, , stage] of candidates) {
    const onDisk = await engine.exists(`${engine.dir}/${path}`);
    files.push({
      path,
      workdir: onDisk ? await engine.readFile(path) : null,
      untracked: head === 0 && stage === 0,
    });
  }

  const branch = await engine.currentBranch();
  const { commit } = await git.readCommit({ ...common, oid: headOid });
  const subject = commit.message.split("\n")[0];
  const on = branch ?? "(no branch)";
  const label = opts.message
    ? `On ${on}: ${opts.message}`
    : `WIP on ${on}: ${headOid.slice(0, 7)} ${subject}`;

  const { oid } = await git.hashBlob({
    object: JSON.stringify({ label, headOid, files }),
  });
  const entry: StashEntry = { oid, label, branch, headOid, files };
  engine.stash.unshift(entry);

  // back to a clean working directory: index + tracked files return to HEAD
  await git.checkout({
    ...common,
    ref: branch ?? headOid,
    force: true,
    noUpdateHead: branch === null,
  });

  // checkout leaves behind whatever HEAD never knew about: staged-new files and
  // (with -u) untracked ones. Those were stashed, so they must go.
  const headFiles = await git.listFiles({ ...common, ref: headOid });
  for (const f of files) {
    if (headFiles.includes(f.path)) continue;
    try {
      await git.remove({ ...common, filepath: f.path });
    } catch {
      // not in the index
    }
    if (await engine.exists(`${engine.dir}/${f.path}`)) await engine.deleteFile(f.path);
  }

  return { saved: true, entry };
}

/**
 * `git stash apply` — restores the working tree only. Real git leaves the index
 * alone without `--index`, so staged changes come back unstaged and staged-new
 * files come back untracked.
 */
export async function stashApply(engine: GitEngine, index: number): Promise<StashEntry> {
  const entry = engine.stash[index];
  if (!entry) throw noSuchEntry(index);

  const matrix = await engine.statusMatrix();
  const dirty = new Set(
    matrix
      .filter(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
      .filter(([, head, workdir, stage]) => !(head === 0 && workdir === 2 && stage === 0))
      .map(([path]) => path),
  );
  const clobbered = entry.files.filter((f) => dirty.has(f.path)).map((f) => f.path);
  if (clobbered.length > 0) {
    throw new GitOpError(
      "error: Your local changes to the following files would be overwritten by merge:\n" +
        clobbered.map((f) => `\t${f}`).join("\n") +
        "\nPlease commit your changes or stash them before you merge.\nAborting",
    );
  }

  for (const f of entry.files) {
    if (f.workdir === null) {
      if (await engine.exists(`${engine.dir}/${f.path}`)) await engine.deleteFile(f.path);
    } else {
      // through engine.writeFile: the mtime bump is what makes a same-size
      // restore (1.90 → 2.00) visible to statusMatrix
      await engine.writeFile(f.path, f.workdir);
    }
  }
  return entry;
}

export function stashDrop(engine: GitEngine, index: number): StashEntry {
  const entry = engine.stash[index];
  if (!entry) throw noSuchEntry(index);
  engine.stash.splice(index, 1);
  return entry;
}

export async function stashPop(engine: GitEngine, index: number): Promise<StashEntry> {
  const entry = await stashApply(engine, index);
  stashDrop(engine, index);
  return entry;
}

function noSuchEntry(index: number): GitOpError {
  return new GitOpError(`error: refs/stash@{${index}} is not a valid reference`, 1);
}
