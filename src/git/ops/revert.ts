import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";
import { blobOidAt, diffTrees } from "../blobs";

/**
 * `git revert <commit>` - single-parent targets, clean reverts only
 * (challenge content guarantees the touched files are unchanged since the
 * target commit; anything else is refused like a revert conflict).
 */
export async function revert(
  engine: GitEngine,
  target: string,
): Promise<string> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };

  const oid = await engine.resolve(target);
  const short = oid.slice(0, 7);
  const { commit } = await git.readCommit({ ...common, oid });
  const firstLine = commit.message.split("\n")[0];

  if (commit.parent.length !== 1) {
    throw new GitOpError(
      `error: commit ${short} is a merge but no -m option was given.\nfatal: revert failed`,
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
      "error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed",
    );
  }

  const changes = await diffTrees(engine, parentOid, oid);

  // clean-revert check: HEAD must still hold the target commit's version
  for (const ch of changes) {
    const headOid = await blobOidAt(engine, "HEAD", ch.path);
    if ((ch.after ?? null) !== (headOid ?? null)) {
      throw new GitOpError(
        `error: could not revert ${short}... ${firstLine}\nhint: the file '${ch.path}' has changed since that commit.\nfatal: revert failed`,
      );
    }
  }

  // apply the inverse of the commit
  for (const ch of changes) {
    if (ch.before === null) {
      // the commit added this file → delete it
      await engine.deleteFile(ch.path);
      await git.remove({ ...common, filepath: ch.path });
    } else {
      // the commit modified/deleted it → write back the parent's version
      const { blob } = await git.readBlob({
        ...common,
        oid: parentOid,
        filepath: ch.path,
      });
      await engine.writeFile(ch.path, new TextDecoder().decode(blob));
      await git.add({ ...common, filepath: ch.path });
    }
  }

  return engine.commit({
    message: `Revert "${firstLine}"\n\nThis reverts commit ${oid}.\n`,
  });
}
