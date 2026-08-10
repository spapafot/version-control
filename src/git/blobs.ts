import * as git from "isomorphic-git";
import type { GitEngine } from "./engine";

export interface TreeChange {
  path: string;
  before: string | null; // blob oid in the "before" tree
  after: string | null; // blob oid in the "after" tree
}

/** Blob-level diff between two commits' trees. */
export async function diffTrees(
  engine: GitEngine,
  beforeOid: string,
  afterOid: string,
): Promise<TreeChange[]> {
  const results: TreeChange[] = await git.walk({
    fs: engine.fsp.fs,
    dir: engine.dir,
    cache: engine.cache,
    trees: [git.TREE({ ref: beforeOid }), git.TREE({ ref: afterOid })],
    map: async (path: string, [a, b]: any[]) => {
      if (path === ".") return undefined;
      const aType = a ? await a.type() : null;
      const bType = b ? await b.type() : null;
      if (aType === "tree" || bType === "tree") return undefined;
      const before = a ? await a.oid() : null;
      const after = b ? await b.oid() : null;
      if (before === after) return undefined;
      return { path, before, after };
    },
  });
  return results ?? [];
}

/** Blob oid of a path at a revision, or null when absent. */
export async function blobOidAt(
  engine: GitEngine,
  ref: string,
  filepath: string,
): Promise<string | null> {
  try {
    const oid = await engine.resolve(ref);
    const { oid: blobOid } = await git.readBlob({
      fs: engine.fsp.fs,
      dir: engine.dir,
      cache: engine.cache,
      oid,
      filepath,
    });
    return blobOid;
  } catch {
    return null;
  }
}

/** Blob oid of a path in the index, or null. */
export async function stagedBlobOid(
  engine: GitEngine,
  filepath: string,
): Promise<string | null> {
  const results: string[] = await git.walk({
    fs: engine.fsp.fs,
    dir: engine.dir,
    cache: engine.cache,
    trees: [git.STAGE()],
    map: async (fp: string, [entry]: any[]) => {
      if (fp !== filepath || !entry) return undefined;
      if ((await entry.type()) !== "blob") return undefined;
      return entry.oid();
    },
  });
  return results?.[0] ?? null;
}

export async function readBlobText(engine: GitEngine, oid: string): Promise<string> {
  const { blob } = await git.readBlob({
    fs: engine.fsp.fs,
    dir: engine.dir,
    cache: engine.cache,
    oid,
  });
  return new TextDecoder().decode(blob);
}

/** Text of a path at a revision, or null when absent. */
export async function textAt(
  engine: GitEngine,
  ref: string,
  filepath: string,
): Promise<string | null> {
  const oid = await blobOidAt(engine, ref, filepath);
  return oid === null ? null : readBlobText(engine, oid);
}

/** Text of a path in the index, or null. */
export async function stagedText(
  engine: GitEngine,
  filepath: string,
): Promise<string | null> {
  const oid = await stagedBlobOid(engine, filepath);
  return oid === null ? null : readBlobText(engine, oid);
}
