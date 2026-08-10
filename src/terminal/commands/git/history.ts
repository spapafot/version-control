import { GitOpError } from "@/git/errors";
import type { ShellCommand } from "../types";
import { commitSummary, short } from "./helpers";

export const reflog: ShellCommand = {
  spec: { flags: {} },
  run(ctx) {
    const entries = ctx.engine.reflog;
    if (entries.length === 0) {
      throw new GitOpError("fatal: your current branch 'main' does not have any commits yet", 128);
    }
    ctx.stdout(
      entries.map((e, i) => `${short(e.oid)} HEAD@{${i}}: ${e.action}`).join("\n"),
    );
    return 0;
  },
};

export const cherryPick: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    const target = args.positionals[0];
    if (!target) throw new GitOpError("usage: git cherry-pick <commit>", 129);
    const oid = await ctx.engine.cherryPick(target);
    ctx.stdout(await commitSummary(ctx.engine, oid));
    return 0;
  },
};
