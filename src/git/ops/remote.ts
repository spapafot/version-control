import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";
import type { Persona } from "../types";

/**
 * The simulated remote: a second GitEngine at /origin on the SAME memfs
 * volume. fetch/push copy objects directly between the two object stores
 * (deflated-format read/write is byte-identical, so oids - and therefore the
 * deterministic setup hashes - are preserved). No network, no pack protocol.
 *
 * Invariant: origin is logically bare after setup. Learner pushes move
 * `refs/heads/*` only; origin's worktree and index go stale and nothing ever
 * reads them post-setup. (Setup DOES check out origin's worktree, so that
 * `onRemote` steps can stage and commit on it.)
 */

export const REMOTE_DIR = "/origin";
/** what `git remote -v` prints as the address */
export const REMOTE_URL = "/origin";
/** Maria - the café's co-manager; author of everything pushed "from her laptop" */
export const REMOTE_AUTHOR: Persona = {
  name: "Maria",
  email: "maria@versioncontrol.gr",
};

export interface FetchUpdate {
  branch: string;
  old: string | null; // null → new branch
  new: string;
}

export type PushResult =
  | { kind: "ok"; branch: string; old: string; new: string }
  | { kind: "new-branch"; branch: string }
  | { kind: "up-to-date" }
  | { kind: "rejected"; branch: string };

const common = (e: GitEngine) => ({ fs: e.fsp.fs, dir: e.dir, cache: e.cache });

/**
 * BFS-copy the object closure of `wants` (commit oids) from src to dst.
 * An oid already present in dst is skipped along with its whole subgraph:
 * this system only ever writes complete closures.
 */
export async function copyObjects(
  src: GitEngine,
  dst: GitEngine,
  wants: string[],
): Promise<void> {
  const queue: Array<{ oid: string; type: "commit" | "tree" | "blob" }> =
    wants.map((oid) => ({
      oid,
      type: "commit",
    }));
  const seen = new Set<string>();

  while (queue.length > 0) {
    const { oid, type } = queue.shift()!;
    if (seen.has(oid)) continue;
    seen.add(oid);

    let deflated: Uint8Array;
    try {
      await git.readObject({ ...common(dst), oid, format: "deflated" });
      continue; // present ⇒ subgraph present
    } catch {
      const r = await git.readObject({
        ...common(src),
        oid,
        format: "deflated",
      });
      deflated = r.object as Uint8Array;
    }

    if (type === "commit") {
      const { commit } = await git.readCommit({ ...common(src), oid });
      queue.push({ oid: commit.tree, type: "tree" });
      queue.push(
        ...commit.parent.map((p) => ({ oid: p, type: "commit" as const })),
      );
    } else if (type === "tree") {
      const { tree } = await git.readTree({ ...common(src), oid });
      queue.push(
        ...tree.map((e) => ({
          oid: e.oid,
          type: e.type === "tree" ? ("tree" as const) : ("blob" as const),
        })),
      );
    }

    await git.writeObject({
      fs: dst.fsp.fs,
      dir: dst.dir,
      object: deflated,
      format: "deflated",
      oid,
    });
  }
}

/** `git fetch`: copy origin's news, move `refs/remotes/origin/*`. Touches nothing else. */
export async function fetchFromOrigin(
  engine: GitEngine,
): Promise<FetchUpdate[]> {
  const origin = engine.remote;
  if (!origin) {
    throw new GitOpError(
      "fatal: No remote repository specified. Please, specify either a URL or a\n" +
        "remote name from which new revisions should be fetched.",
      128,
    );
  }

  const updates: FetchUpdate[] = [];
  for (const name of await git.listBranches(common(origin))) {
    const newOid = await git.resolveRef({
      ...common(origin),
      ref: `refs/heads/${name}`,
    });
    const old = await git
      .resolveRef({ ...common(engine), ref: `refs/remotes/origin/${name}` })
      .catch(() => null);
    if (old === newOid) continue;
    await copyObjects(origin, engine, [newOid]);
    await git.writeRef({
      fs: engine.fsp.fs,
      dir: engine.dir,
      ref: `refs/remotes/origin/${name}`,
      value: newOid,
      force: true,
    });
    updates.push({ branch: name, old, new: newOid });
  }
  return updates;
}

/** `git push`: fast-forward-only ref update on origin, plus the local tracking ref. */
export async function pushToOrigin(
  engine: GitEngine,
  branch: string,
): Promise<PushResult> {
  const origin = engine.remote;
  if (!origin) {
    throw new GitOpError(
      "fatal: No configured push destination.\n" +
        "Either specify the URL from the command-line or configure a remote repository using\n\n" +
        "    git remote add <name> <url>\n\n" +
        "and then push using the remote name\n\n" +
        "    git push <name>",
      128,
    );
  }

  const localOid = await git
    .resolveRef({ ...common(engine), ref: `refs/heads/${branch}` })
    .catch(() => {
      throw new GitOpError(
        `error: src refspec ${branch} does not match any`,
        1,
      );
    });
  const remoteOid = await git
    .resolveRef({ ...common(origin), ref: `refs/heads/${branch}` })
    .catch(() => null);

  if (remoteOid === localOid) return { kind: "up-to-date" };

  const writeRefs = async () => {
    await git.writeRef({
      fs: origin.fsp.fs,
      dir: origin.dir,
      ref: `refs/heads/${branch}`,
      value: localOid,
      force: true,
    });
    // real git also advances the tracking ref on a successful push
    await git.writeRef({
      fs: engine.fsp.fs,
      dir: engine.dir,
      ref: `refs/remotes/origin/${branch}`,
      value: localOid,
      force: true,
    });
  };

  if (remoteOid === null) {
    await copyObjects(engine, origin, [localOid]);
    await writeRefs();
    return { kind: "new-branch", branch };
  }

  // fast-forward check; a NotFound (origin has commits we never fetched)
  // is exactly the "fetch first" situation
  const ff = await git
    .isDescendent({
      ...common(engine),
      oid: localOid,
      ancestor: remoteOid,
      depth: -1,
    })
    .catch(() => false);
  if (!ff) return { kind: "rejected", branch };

  await copyObjects(engine, origin, [localOid]);
  await writeRefs();
  return { kind: "ok", branch, old: remoteOid, new: localOid };
}

/**
 * Setup-time publish: mirror <branch> onto origin and check its worktree out,
 * so subsequent `onRemote` steps can stage and commit there.
 */
export async function mirrorToOrigin(
  engine: GitEngine,
  branch: string,
): Promise<void> {
  const origin = engine.remote;
  if (!origin) throw new Error("mirrorToOrigin: origin engine not attached");

  const localOid = await git.resolveRef({
    ...common(engine),
    ref: `refs/heads/${branch}`,
  });
  await copyObjects(engine, origin, [localOid]);
  await git.writeRef({
    fs: origin.fsp.fs,
    dir: origin.dir,
    ref: `refs/heads/${branch}`,
    value: localOid,
    force: true,
  });
  await git.writeRef({
    fs: origin.fsp.fs,
    dir: origin.dir,
    ref: "HEAD",
    value: `refs/heads/${branch}`,
    symbolic: true,
    force: true,
  });
  await git.checkout({ ...common(origin), ref: branch, force: true });
  await git.writeRef({
    fs: engine.fsp.fs,
    dir: engine.dir,
    ref: `refs/remotes/origin/${branch}`,
    value: localOid,
    force: true,
  });
}
