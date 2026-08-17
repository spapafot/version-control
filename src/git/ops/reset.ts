import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";

/**
 * `git reset --soft|--mixed|--hard <target>` - implemented on isomorphic-git
 * primitives (it has no reset). Only while on a branch; no reflog.
 */
export async function reset(
  engine: GitEngine,
  mode: "soft" | "mixed" | "hard",
  target: string,
): Promise<string> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };
  const branch = await engine.currentBranch();
  if (!branch) throw new GitOpError("fatal: not on a branch", 128);

  const targetOid = await engine.resolve(target);

  // all modes: move the current branch ref
  await git.writeRef({
    fs: engine.fsp.fs,
    dir: engine.dir,
    ref: `refs/heads/${branch}`,
    value: targetOid,
    force: true,
  });

  if (mode === "soft") return targetOid;

  if (mode === "hard") {
    // force-checkout the (moved) branch: index + workdir now match the target
    await git.checkout({ ...common, ref: branch, force: true });
    return targetOid;
  }

  // mixed: rebuild the index to match the target; workdir untouched
  const targetFiles = await git.listFiles({ ...common, ref: targetOid });
  const indexFiles = await git.listFiles(common);
  for (const filepath of targetFiles) {
    await git.resetIndex({ ...common, filepath, ref: targetOid });
  }
  for (const filepath of indexFiles) {
    if (!targetFiles.includes(filepath)) {
      await git.remove({ ...common, filepath });
    }
  }
  return targetOid;
}
