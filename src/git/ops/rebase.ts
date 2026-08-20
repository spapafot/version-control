import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";
import type { RebaseOutcome } from "../types";
import { cherryPick } from "./cherry-pick";
import { reset } from "./reset";

/**
 * `git rebase <upstream>` for clean, linear histories.
 *
 * The course uses this for the safe everyday case: unpublished local commits
 * replayed on top of a fetched remote-tracking branch. Merge commits and
 * conflicts are rejected without changing the branch.
 */
export async function rebase(
  engine: GitEngine,
  upstream: string,
): Promise<RebaseOutcome> {
  if (engine.mergeState) {
    throw new GitOpError(
      "fatal: It seems that there is already a merge in progress.\n" +
        "Please finish or abort it before rebasing.",
      128,
    );
  }

  const branch = await engine.currentBranch();
  if (!branch) throw new GitOpError("fatal: You are not currently on a branch.", 128);
  await engine.requireCleanTree("rebase");

  let upstreamOid: string;
  try {
    upstreamOid = await engine.resolve(upstream);
  } catch {
    throw new GitOpError(`fatal: invalid upstream '${upstream}'`, 128);
  }

  const originalOid = await engine.resolve("HEAD");
  if (originalOid === upstreamOid) return { kind: "already-up-to-date" };

  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };
  const bases = await git.findMergeBase({
    ...common,
    oids: [originalOid, upstreamOid],
  });
  if (bases.length === 0) {
    throw new GitOpError("fatal: refusing to rebase unrelated histories", 128);
  }

  if (bases.includes(upstreamOid)) return { kind: "already-up-to-date" };

  if (bases.includes(originalOid)) {
    const oid = await reset(engine, "hard", upstreamOid);
    engine.recordReflog(oid, `rebase (finish): ${branch} onto ${upstream}`);
    return { kind: "fast-forward", oid };
  }

  const base = bases[0];
  const commits: Array<{
    oid: string;
    message: string;
    author: { name: string; email: string };
  }> = [];
  let cursor = originalOid;
  while (cursor !== base) {
    const { commit } = await git.readCommit({ ...common, oid: cursor });
    if (commit.parent.length !== 1) {
      throw new GitOpError(
        "fatal: this browser course supports rebase only for linear histories without merge commits",
        128,
      );
    }
    commits.push({
      oid: cursor,
      message: commit.message,
      author: { name: commit.author.name, email: commit.author.email },
    });
    cursor = commit.parent[0];
    if (!cursor) {
      throw new GitOpError(
        "fatal: this browser course supports rebase only for linear histories",
        128,
      );
    }
  }
  commits.reverse();

  const reflogBefore = [...engine.reflog];
  try {
    await reset(engine, "hard", upstreamOid);
    let oid = upstreamOid;
    for (const commit of commits) {
      oid = await cherryPick(engine, commit.oid, {
        author: commit.author,
        reflogAction: `rebase (pick): ${commit.message.split("\n")[0]}`,
      });
    }
    engine.recordReflog(oid, `rebase (finish): ${branch} onto ${upstream}`);
    return { kind: "rebased", oid, count: commits.length };
  } catch (error) {
    await reset(engine, "hard", originalOid);
    engine.reflog.splice(0, engine.reflog.length, ...reflogBefore);
    if (error instanceof GitOpError) {
      throw new GitOpError(
        error.message.replaceAll("cherry-pick", "rebase"),
        error.exitCode,
      );
    }
    throw error;
  }
}
