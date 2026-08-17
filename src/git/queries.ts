import type { CommitNode, RepoState } from "./types";

/** oid → commit lookup + BFS reachability over parent edges. */
export function isReachable(
  commits: Array<Pick<CommitNode, "oid" | "parents">>,
  fromOid: string | null,
  targetOid: string,
): boolean {
  if (!fromOid) return false;
  const byOid = new Map(commits.map((c) => [c.oid, c]));
  const queue = [fromOid];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const oid = queue.shift()!;
    if (oid === targetOid) return true;
    if (seen.has(oid)) continue;
    seen.add(oid);
    queue.push(...(byOid.get(oid)?.parents ?? []));
  }
  return false;
}

/** Commits reachable from HEAD (what `git log` shows), newest first. */
export function reachableFromHead(state: RepoState): CommitNode[] {
  if (!state.head.oid) return [];
  const byOid = new Map(state.commits.map((c) => [c.oid, c]));
  const seen = new Set<string>();
  const queue = [state.head.oid];
  while (queue.length > 0) {
    const oid = queue.shift()!;
    if (seen.has(oid)) continue;
    seen.add(oid);
    const c = byOid.get(oid);
    if (c) queue.push(...c.parents);
  }
  return state.commits.filter((c) => seen.has(c.oid));
}

export function headCommit(state: RepoState): CommitNode | null {
  return state.commits.find((c) => c.oid === state.head.oid) ?? null;
}

/**
 * Commits each side has that the other doesn't (`main` vs `origin/main`).
 * Both tips must be present in `commits` - tracking tips always are, since
 * the snapshot walk starts from them.
 */
export function aheadBehind(
  commits: Array<Pick<CommitNode, "oid" | "parents">>,
  localOid: string,
  trackingOid: string,
): { ahead: number; behind: number } {
  const byOid = new Map(commits.map((c) => [c.oid, c]));
  const reach = (from: string): Set<string> => {
    const seen = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const oid = queue.shift()!;
      if (seen.has(oid)) continue;
      seen.add(oid);
      queue.push(...(byOid.get(oid)?.parents ?? []));
    }
    return seen;
  };
  const local = reach(localOid);
  const tracking = reach(trackingOid);
  let ahead = 0;
  let behind = 0;
  for (const oid of local) if (!tracking.has(oid)) ahead++;
  for (const oid of tracking) if (!local.has(oid)) behind++;
  return { ahead, behind };
}
