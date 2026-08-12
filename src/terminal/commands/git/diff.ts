import { structuredPatch } from "diff";
import { stagedText, textAt } from "@/git/blobs";
import type { Paint } from "../../format/color";
import type { ShellCommand } from "../types";

export const diff: ShellCommand = {
  spec: {
    flags: {
      staged: { long: "staged" },
      cached: { long: "cached" },
    },
  },
  async run(ctx, args) {
    const engine = ctx.engine;
    const state = await engine.snapshot();
    const stagedMode = Boolean(args.flags.staged || args.flags.cached);
    const paths = args.positionals;
    const out: string[] = [];

    for (const f of state.status) {
      if (paths.length > 0 && !paths.includes(f.path)) continue;
      if (f.conflicted) continue;

      let before: string | null;
      let after: string | null;
      if (stagedMode) {
        if (!f.staged) continue;
        before = await textAt(engine, "HEAD", f.path);
        after = await stagedText(engine, f.path);
      } else {
        if (!f.unstaged) continue;
        before = await stagedText(engine, f.path);
        after = f.unstaged === "deleted" ? null : (state.workdir.find((w) => w.path === f.path)?.content ?? null);
      }
      if (before === after) continue;
      out.push(renderFileDiff(f.path, before, after, ctx.paint));
    }

    if (out.length > 0) ctx.stdout(out.join("\n"));
    return 0;
  },
};

/** git's `color.diff` defaults: meta bold, hunk headers cyan, +green, -red. */
function renderFileDiff(
  path: string,
  before: string | null,
  after: string | null,
  paint: Paint,
): string {
  const meta = (text: string) => paint("bold", text);
  const lines: string[] = [meta(`diff --git a/${path} b/${path}`)];
  if (before === null) lines.push(meta("new file mode 100644"));
  if (after === null) lines.push(meta("deleted file mode 100644"));
  lines.push(meta(before === null ? "--- /dev/null" : `--- a/${path}`));
  lines.push(meta(after === null ? "+++ /dev/null" : `+++ b/${path}`));

  const patch = structuredPatch(path, path, before ?? "", after ?? "", "", "", { context: 3 });
  for (const hunk of patch.hunks) {
    lines.push(
      paint("cyan", `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`),
    );
    for (const line of hunk.lines) {
      if (line.startsWith("+")) lines.push(paint("green", line));
      else if (line.startsWith("-")) lines.push(paint("red", line));
      else lines.push(line);
    }
  }
  return lines.join("\n");
}
