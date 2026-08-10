import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";
import { stagedBlobOid } from "../blobs";

/**
 * `git restore [--staged] [--worktree] <paths>`.
 * Worktree restore copies from the INDEX (real-git semantics).
 * `--staged` resets index entries to HEAD; entries absent from HEAD are dropped.
 */
export async function restore(
  engine: GitEngine,
  paths: string[],
  opts: { staged: boolean; worktree: boolean },
): Promise<void> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };

  const expanded =
    paths.length === 1 && paths[0] === "."
      ? await changedPaths(engine, opts)
      : paths;

  for (const filepath of expanded) {
    if (opts.staged) {
      const inHead = await isInHead(engine, filepath);
      if (inHead) {
        await git.resetIndex({ ...common, filepath, ref: "HEAD" });
      } else {
        const indexFiles = await git.listFiles(common);
        if (!indexFiles.includes(filepath)) {
          throw new GitOpError(
            `error: pathspec '${filepath}' did not match any file(s) known to git`,
          );
        }
        await git.remove({ ...common, filepath });
      }
    }
    if (opts.worktree) {
      const oid = await stagedBlobOid(engine, filepath);
      if (oid === null) {
        throw new GitOpError(
          `error: pathspec '${filepath}' did not match any file(s) known to git`,
        );
      }
      const { blob } = await git.readBlob({ ...common, oid });
      await engine.writeFile(filepath, new TextDecoder().decode(blob));
    }
  }
}

async function changedPaths(
  engine: GitEngine,
  opts: { staged: boolean; worktree: boolean },
): Promise<string[]> {
  const matrix = await engine.statusMatrix();
  return matrix
    .filter(([, head, workdir, stage]) => {
      if (opts.staged && !(head === 1 && stage === 1) && !(head === 0 && stage === 0))
        return true;
      if (opts.worktree && workdir !== 1 && stage !== 0) return true;
      return false;
    })
    .map(([f]) => f);
}

async function isInHead(engine: GitEngine, filepath: string): Promise<boolean> {
  try {
    const head = await engine.resolve("HEAD");
    const files = await git.listFiles({
      fs: engine.fsp.fs,
      dir: engine.dir,
      cache: engine.cache,
      ref: head,
    });
    return files.includes(filepath);
  } catch {
    return false; // unborn HEAD
  }
}
