import type { CommitNode } from "./types";

export interface GraphNode {
  commit: CommitNode;
  row: number; // 0 = newest, top of the graph
  lane: number;
}

export interface GraphEdge {
  child: { row: number; lane: number };
  parent: { row: number; lane: number };
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  laneCount: number;
  rowCount: number;
}

/**
 * Assign lanes to a commit DAG (input newest-first, parents always after
 * children - guaranteed by our monotonic setup/user timestamps).
 */
export function layoutGraph(commits: CommitNode[]): GraphLayout {
  const nodes: GraphNode[] = [];
  const pos = new Map<string, { row: number; lane: number }>();
  /** the oid each lane is waiting to see next (null = free) */
  const expect: Array<string | null> = [];

  commits.forEach((commit, row) => {
    const matching = expect
      .map((oid, i) => (oid === commit.oid ? i : -1))
      .filter((i) => i >= 0);

    let lane: number;
    if (matching.length === 0) {
      lane = expect.indexOf(null);
      if (lane === -1) {
        lane = expect.length;
        expect.push(null);
      }
    } else {
      lane = Math.min(...matching);
      for (const i of matching) if (i !== lane) expect[i] = null;
    }

    pos.set(commit.oid, { row, lane });
    nodes.push({ commit, row, lane });

    const [first, ...rest] = commit.parents;
    expect[lane] = first ?? null;
    for (const p of rest) {
      if (!expect.includes(p)) {
        let free = expect.indexOf(null);
        if (free === -1) {
          free = expect.length;
          expect.push(null);
        }
        expect[free] = p;
      }
    }
  });

  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    for (const p of node.commit.parents) {
      const parentPos = pos.get(p);
      if (parentPos) {
        edges.push({
          child: { row: node.row, lane: node.lane },
          parent: parentPos,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    laneCount: Math.max(1, expect.length),
    rowCount: commits.length,
  };
}
