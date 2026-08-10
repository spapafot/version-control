import * as git from "isomorphic-git";
import { GitOpError } from "./errors";
import type { GitEngine } from "./engine";

/**
 * Resolve HEAD / branch / short-oid revisions with ~N and ^ suffixes to a full oid.
 * Supported grammar: <base>(~N | ^)* — first-parent only (challenge repos never need ^2).
 */
export async function revparse(engine: GitEngine, revish: string): Promise<string> {
  const match = revish.match(/^([^~^]+)((?:~\d*|\^)*)$/);
  if (!match) throw unknownRevision(revish);
  const [, base, suffix] = match;

  let oid = await resolveBase(engine, base, revish);

  const ops = suffix.match(/~\d*|\^/g) ?? [];
  for (const op of ops) {
    const steps = op === "^" ? 1 : op === "~" ? 1 : parseInt(op.slice(1), 10);
    for (let i = 0; i < steps; i++) {
      const { commit } = await git.readCommit({
        fs: engine.fsp.fs,
        dir: engine.dir,
        cache: engine.cache,
        oid,
      });
      if (commit.parent.length === 0) throw unknownRevision(revish);
      oid = commit.parent[0];
    }
  }
  return oid;
}

async function resolveBase(engine: GitEngine, base: string, revish: string): Promise<string> {
  const common = { fs: engine.fsp.fs, dir: engine.dir, cache: engine.cache };
  const reflogRef = base.match(/^HEAD@\{(\d+)\}$/i);
  if (reflogRef) {
    const entry = engine.reflog[parseInt(reflogRef[1], 10)];
    if (!entry) throw unknownRevision(revish);
    return entry.oid;
  }
  try {
    return await git.resolveRef({ ...common, ref: base });
  } catch {
    // not a ref — maybe a (short) commit hash
  }
  if (/^[0-9a-f]{4,40}$/i.test(base)) {
    try {
      return await git.expandOid({ ...common, oid: base.toLowerCase() });
    } catch {
      // fall through
    }
  }
  throw unknownRevision(revish);
}

function unknownRevision(revish: string): GitOpError {
  return new GitOpError(
    `fatal: ambiguous argument '${revish}': unknown revision or path not in the working tree.`,
    128,
  );
}
