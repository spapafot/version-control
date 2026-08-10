import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";
import { blobOidAt, diffTrees } from "../blobs";

/**
 * `git cherry-pick <commit>` — the forward twin of ops/revert.ts.
 * Single-parent targets, clean applies only (each touched path in HEAD must
 * still match the target commit's parent); challenge content guarantees this.
 */
export async function cherryPick(engine: GitEngine, target: string): Promise<string> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };

  const oid = await engine.resolve(target);
  const short = oid.slice(0, 7);
  const { commit } = await git.readCommit({ ...common, oid });
  const firstLine = commit.message.split("\n")[0];

  if (commit.parent.length !== 1) {
    throw new GitOpError(
      `error: commit ${short} is a merge but no -m option was given.\nfatal: cherry-pick failed`,
    );
  }
  const parentOid = commit.parent[0];

  const dirty = (await engine.statusMatrix()).some(
    ([, head, workdir, stage]) =>
      !(head === 1 && workdir === 1 && stage === 1) &&
      !(head === 0 && workdir === 2 && stage === 0),
  );
  if (dirty) {
    throw new GitOpError(
      "error: your local changes would be overwritten by cherry-pick.\nhint: commit your changes or stash them to proceed.\nfatal: cherry-pick failed",
    );
  }

  const changes = await diffTrees(engine, parentOid, oid);

  // clean-apply check: HEAD must hold the parent's version of every touched path
  for (const ch of changes) {
    const headOid = await blobOidAt(engine, "HEAD", ch.path);
    if ((ch.before ?? null) !== (headOid ?? null)) {
      throw new GitOpError(
        `error: could not apply ${short}... ${firstLine}\nhint: the file '${ch.path}' differs from that commit's base.\nfatal: cherry-pick failed`,
      );
    }
  }

  // apply the commit's changes forward
  for (const ch of changes) {
    if (ch.after === null) {
      // the commit deleted this file
      await engine.deleteFile(ch.path);
      await git.remove({ ...common, filepath: ch.path });
    } else {
      const { blob } = await git.readBlob({ ...common, oid, filepath: ch.path });
      await engine.writeFile(ch.path, new TextDecoder().decode(blob));
      await git.add({ ...common, filepath: ch.path });
    }
  }

  return engine.commit({ message: commit.message });
}
