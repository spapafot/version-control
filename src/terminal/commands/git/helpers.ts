import * as git from "isomorphic-git";
import { diffLines } from "diff";
import type { GitEngine } from "@/git/engine";
import { diffTrees, readBlobText, type TreeChange } from "@/git/blobs";

export const short = (oid: string) => oid.slice(0, 7);

/**
 * The `[main abc1234] message` + ` N files changed, …` block printed by
 * commit and revert.
 */
export async function commitSummary(engine: GitEngine, oid: string): Promise<string> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };
  const { commit } = await git.readCommit({ ...common, oid });
  const branch = (await engine.currentBranch()) ?? "HEAD";
  const firstLine = commit.message.split("\n")[0];
  const isRoot = commit.parent.length === 0;

  let changes: TreeChange[];
  if (isRoot) {
    const files = await git.listFiles({ ...common, ref: oid });
    changes = [];
    for (const path of files) {
      const { oid: blobOid } = await git.readBlob({ ...common, oid, filepath: path });
      changes.push({ path, before: null, after: blobOid });
    }
  } else {
    changes = await diffTrees(engine, commit.parent[0], oid);
  }

  let insertions = 0;
  let deletions = 0;
  for (const ch of changes) {
    const before = ch.before ? await readBlobText(engine, ch.before) : "";
    const after = ch.after ? await readBlobText(engine, ch.after) : "";
    for (const part of diffLines(before, after)) {
      if (part.added) insertions += part.count ?? 0;
      if (part.removed) deletions += part.count ?? 0;
    }
  }

  const stats: string[] = [
    `${changes.length} file${changes.length === 1 ? "" : "s"} changed`,
  ];
  if (insertions > 0) stats.push(`${insertions} insertion${insertions === 1 ? "" : "s"}(+)`);
  if (deletions > 0) stats.push(`${deletions} deletion${deletions === 1 ? "" : "s"}(-)`);

  const rootTag = isRoot ? "(root-commit) " : "";
  return `[${branch} ${rootTag}${short(oid)}] ${firstLine}\n ${stats.join(", ")}`;
}
