import { GitOpError } from "@/git/errors";
import type { ShellCommand } from "../types";
import { commitSummary, short } from "./helpers";

export const restore: ShellCommand = {
  spec: {
    flags: {
      staged: { short: "S", long: "staged" },
      worktree: { short: "W", long: "worktree" },
    },
  },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      throw new GitOpError("fatal: you must specify path(s) to restore", 128);
    }
    const staged = Boolean(args.flags.staged);
    const worktree = Boolean(args.flags.worktree) || !staged;
    await ctx.engine.restore(args.positionals, { staged, worktree });
    return 0;
  },
};

export const reset: ShellCommand = {
  spec: {
    flags: {
      soft: { long: "soft" },
      mixed: { long: "mixed" },
      hard: { long: "hard" },
    },
  },
  async run(ctx, args) {
    const engine = ctx.engine;
    const mode = args.flags.hard ? "hard" : args.flags.soft ? "soft" : "mixed";
    const target = args.positionals[0] ?? "HEAD";
    await engine.reset(mode, target);

    if (mode === "hard") {
      const state = await engine.snapshot();
      const head = state.commits.find((c) => c.oid === state.head.oid);
      ctx.stdout(`HEAD is now at ${short(state.head.oid!)} ${head?.message.split("\n")[0] ?? ""}`);
      return 0;
    }
    if (mode === "mixed") {
      const state = await engine.snapshot();
      const changed = state.status.filter((f) => f.unstaged);
      if (changed.length > 0) {
        ctx.stdout(
          "Unstaged changes after reset:\n" +
            changed.map((f) => `${f.unstaged === "deleted" ? "D" : "M"}\t${f.path}`).join("\n"),
        );
      }
    }
    return 0;
  },
};

export const revert: ShellCommand = {
  spec: { flags: { noEdit: { long: "no-edit" } } },
  async run(ctx, args) {
    const target = args.positionals[0];
    if (!target) throw new GitOpError("usage: git revert <commit>", 129);
    const oid = await ctx.engine.revert(target);
    ctx.stdout(await commitSummary(ctx.engine, oid));
    return 0;
  },
};
