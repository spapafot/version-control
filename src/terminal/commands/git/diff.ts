import { structuredPatch } from "diff";
import { stagedText, textAt } from "@/git/blobs";
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
      out.push(renderFileDiff(f.path, before, after));
    }

    if (out.length > 0) ctx.stdout(out.join("\n"));
    return 0;
  },
};

function renderFileDiff(path: string, before: string | null, after: string | null): string {
  const lines: string[] = [`diff --git a/${path} b/${path}`];
  if (before === null) lines.push("new file mode 100644");
  if (after === null) lines.push("deleted file mode 100644");
  lines.push(before === null ? "--- /dev/null" : `--- a/${path}`);
  lines.push(after === null ? "+++ /dev/null" : `+++ b/${path}`);

  const patch = structuredPatch(path, path, before ?? "", after ?? "", "", "", { context: 3 });
  for (const hunk of patch.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.lines);
  }
  return lines.join("\n");
}
