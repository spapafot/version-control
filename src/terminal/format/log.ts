import type { CommitNode, RepoState } from "@/git/types";
import { reachableFromHead } from "@/git/queries";
import { plain, type Paint } from "./color";

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

/**
 * `(HEAD -> main, origin/main)`, coloured like git's `color.decorate` defaults:
 * HEAD cyan, local branches green, remote-tracking ones red, with the brackets
 * and separators in the commit colour (yellow).
 */
function decorations(state: RepoState, commit: CommitNode, paint: Paint): string {
  // refs carry remote-tracking branches as "origin/x"; a local branch may well
  // be called "feature/menu", so the tracking list decides, not the slash
  const remotes = new Set((state.remote?.tracking ?? []).map((t) => `origin/${t.name}`));
  const ref = (name: string) => paint(remotes.has(name) ? "red" : "green", name);

  const parts: string[] = [];
  if (state.head.ref === null && state.head.oid === commit.oid) parts.push(paint("cyan", "HEAD"));
  for (const b of commit.refs) {
    if (state.head.ref === b && state.head.oid === commit.oid) {
      parts.push(`${paint("cyan", "HEAD")}${paint("yellow", " -> ")}${ref(b)}`);
    } else {
      parts.push(ref(b));
    }
  }
  if (parts.length === 0) return "";
  return `${paint("yellow", " (")}${parts.join(paint("yellow", ", "))}${paint("yellow", ")")}`;
}

export function formatLog(
  state: RepoState,
  opts: { oneline?: boolean; paint?: Paint } = {},
): string {
  const paint = opts.paint ?? plain;
  const commits = reachableFromHead(state);
  if (opts.oneline) {
    return commits
      .map(
        (c) =>
          `${paint("yellow", c.oid.slice(0, 7))}${decorations(state, c, paint)} ` +
          c.message.split("\n")[0],
      )
      .join("\n");
  }
  return commits
    .map((c) => {
      const msg = c.message
        .split("\n")
        .map((l) => (l ? `    ${l}` : ""))
        .join("\n");
      return (
        `${paint("yellow", `commit ${c.oid}`)}${decorations(state, c, paint)}\n` +
        `Author: ${c.author.name} <${c.author.email}>\n` +
        `Date:   ${formatGitDate(c.author.timestamp)}\n` +
        `\n${msg}`
      );
    })
    .join("\n\n");
}
