import type { CommitNode, RepoState } from "@/git/types";
import { reachableFromHead } from "@/git/queries";

export { reachableFromHead };

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatGitDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ` +
    `${d.getUTCFullYear()} +0000`
  );
}

function decorations(state: RepoState, commit: CommitNode): string {
  const parts: string[] = [];
  if (state.head.ref === null && state.head.oid === commit.oid) parts.push("HEAD");
  for (const b of commit.refs) {
    if (state.head.ref === b && state.head.oid === commit.oid) parts.push(`HEAD -> ${b}`);
    else parts.push(b);
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export function formatLog(state: RepoState, opts: { oneline?: boolean } = {}): string {
  const commits = reachableFromHead(state);
  if (opts.oneline) {
    return commits
      .map((c) => `${c.oid.slice(0, 7)}${decorations(state, c)} ${c.message.split("\n")[0]}`)
      .join("\n");
  }
  return commits
    .map((c) => {
      const msg = c.message
        .split("\n")
        .map((l) => (l ? `    ${l}` : ""))
        .join("\n");
      return (
        `commit ${c.oid}${decorations(state, c)}\n` +
        `Author: ${c.author.name} <${c.author.email}>\n` +
        `Date:   ${formatGitDate(c.author.timestamp)}\n` +
        `\n${msg}`
      );
    })
    .join("\n\n");
}
