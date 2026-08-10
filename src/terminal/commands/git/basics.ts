import { GitOpError } from "@/git/errors";
import { formatStatus } from "../../format/status";
import { formatLog, reachableFromHead } from "../../format/log";
import type { ShellCommand } from "../types";
import { commitSummary } from "./helpers";

export const init: ShellCommand = {
  spec: { flags: {} },
  async run(ctx) {
    const already = await ctx.engine.isInitialized();
    await ctx.engine.init("main");
    ctx.stdout(
      already
        ? "Reinitialized existing Git repository in /repo/.git/"
        : "Initialized empty Git repository in /repo/.git/",
    );
    return 0;
  },
};

export const status: ShellCommand = {
  spec: { flags: {} },
  async run(ctx) {
    ctx.stdout(formatStatus(await ctx.engine.snapshot()));
    return 0;
  },
};

export const add: ShellCommand = {
  spec: { flags: { all: { short: "A", long: "all" } } },
  async run(ctx, args) {
    if (args.flags.all || args.positionals.includes(".")) {
      await ctx.engine.addAll();
      for (const p of args.positionals) {
        if (p !== ".") await ctx.engine.add(p);
      }
      return 0;
    }
    if (args.positionals.length === 0) {
      throw new GitOpError(
        "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?",
      );
    }
    for (const p of args.positionals) {
      await ctx.engine.add(p);
    }
    return 0;
  },
};

export const commit: ShellCommand = {
  spec: {
    flags: {
      message: { short: "m", long: "message", takesValue: true },
      all: { short: "a", long: "all" },
    },
  },
  async run(ctx, args) {
    const engine = ctx.engine;

    if (args.flags.all) {
      // stage every tracked change (never untracked files)
      const matrix = await engine.statusMatrix();
      for (const [filepath, head, workdir, stage] of matrix) {
        if (head === 1 && ((workdir === 2 && stage !== 2) || workdir === 0)) {
          await engine.add(filepath);
        }
      }
    }

    const state = await engine.snapshot();
    const hasStaged = state.status.some((f) => f.staged || f.conflicted);
    if (!hasStaged && !state.merge.inProgress) {
      ctx.stdout(formatStatus(state));
      return 1;
    }

    const message = typeof args.flags.message === "string" ? args.flags.message : "";
    if (!message && !state.merge.inProgress) {
      throw new GitOpError(
        'error: no commit message given\nhint: use git commit -m "your message"',
      );
    }

    const oid = await engine.commit({ message });
    ctx.stdout(await commitSummary(engine, oid));
    return 0;
  },
};

export const log: ShellCommand = {
  spec: { flags: { oneline: { long: "oneline" } } },
  async run(ctx, args) {
    const state = await ctx.engine.snapshot();
    if (reachableFromHead(state).length === 0) {
      throw new GitOpError(
        `fatal: your current branch '${state.head.ref ?? "main"}' does not have any commits yet`,
        128,
      );
    }
    ctx.stdout(formatLog(state, { oneline: Boolean(args.flags.oneline) }));
    return 0;
  },
};
