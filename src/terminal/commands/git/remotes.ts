import { GitOpError } from "@/git/errors";
import { REMOTE_URL, type FetchUpdate } from "@/git/ops/remote";
import type { ShellCommand } from "../types";
import { printMergeOutcome, short } from "./helpers";

/**
 * remote / fetch / pull / push against the simulated origin (engine.remote).
 * Output is verbatim real-git English, like every other command here.
 */

export const remote: ShellCommand = {
  spec: { flags: { verbose: { short: "v", long: "verbose" } } },
  async run(ctx, args) {
    if (args.positionals.length > 0) {
      throw new GitOpError(`error: unknown subcommand: '${args.positionals[0]}'`, 129);
    }
    if (!ctx.engine.remote) return 0; // real git: silence when no remotes exist
    if (args.flags.verbose) {
      ctx.stdout(`origin\t${REMOTE_URL} (fetch)\norigin\t${REMOTE_URL} (push)`);
    } else {
      ctx.stdout("origin");
    }
    return 0;
  },
};

function requireOriginName(name: string | undefined): void {
  if (name !== undefined && name !== "origin") {
    throw new GitOpError(`fatal: '${name}' does not appear to be a git repository`, 128);
  }
}

function formatFetchUpdates(updates: FetchUpdate[]): string {
  const width = Math.max(...updates.map((u) => u.branch.length));
  const lines = [`From ${REMOTE_URL}`];
  for (const u of updates) {
    lines.push(
      u.old === null
        ? ` * [new branch]      ${u.branch.padEnd(width)} -> origin/${u.branch}`
        : `   ${short(u.old)}..${short(u.new)}  ${u.branch.padEnd(width)} -> origin/${u.branch}`,
    );
  }
  return lines.join("\n");
}

export const fetch: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    requireOriginName(args.positionals[0]);
    const updates = await ctx.engine.fetch();
    if (updates.length > 0) ctx.stdout(formatFetchUpdates(updates));
    return 0; // nothing new → silent, like real git
  },
};

export const push: ShellCommand = {
  spec: { flags: { setUpstream: { short: "u", long: "set-upstream" } } },
  async run(ctx, args) {
    requireOriginName(args.positionals[0]);
    const current = await ctx.engine.currentBranch();
    const branch = args.positionals[1] ?? current;
    if (!branch) throw new GitOpError("fatal: You are not currently on a branch.", 128);

    // plain `git push` needs an upstream; naming the branch explicitly always works
    if (args.positionals[1] === undefined && ctx.engine.remote) {
      const hasTracking = await ctx.engine.resolve(`origin/${branch}`).then(
        () => true,
        () => false,
      );
      if (!hasTracking) {
        throw new GitOpError(
          `fatal: The current branch ${branch} has no upstream branch.\n` +
            "To push the current branch and set the remote as upstream, use\n\n" +
            `    git push --set-upstream origin ${branch}`,
          128,
        );
      }
    }

    const result = await ctx.engine.push(branch);
    switch (result.kind) {
      case "up-to-date":
        ctx.stdout("Everything up-to-date");
        break;
      case "ok":
        ctx.stdout(`To ${REMOTE_URL}\n   ${short(result.old)}..${short(result.new)}  ${branch} -> ${branch}`);
        break;
      case "new-branch":
        ctx.stdout(`To ${REMOTE_URL}\n * [new branch]      ${branch} -> ${branch}`);
        break;
      case "rejected":
        throw new GitOpError(
          `To ${REMOTE_URL}\n` +
            ` ! [rejected]        ${branch} -> ${branch} (fetch first)\n` +
            `error: failed to push some refs to '${REMOTE_URL}'\n` +
            "hint: Updates were rejected because the remote contains work that you do not\n" +
            "hint: have locally. This is usually caused by another repository pushing to the\n" +
            "hint: same ref. If you want to integrate the remote changes, use 'git pull'\n" +
            "hint: before pushing again.\n" +
            "hint: See the 'Note about fast-forwards' in 'git push --help' for details.",
          1,
        );
    }
    if (args.flags.setUpstream && result.kind !== "up-to-date") {
      ctx.stdout(`branch '${branch}' set up to track 'origin/${branch}'.`);
    }
    return 0;
  },
};

export const pull: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    requireOriginName(args.positionals[0]);
    const engine = ctx.engine;
    const current = await engine.currentBranch();
    const branch = args.positionals[1] ?? current;
    if (!branch) throw new GitOpError("fatal: You are not currently on a branch.", 128);

    const updates = await engine.fetch(); // throws the no-remote fatal
    if (updates.length > 0) ctx.stdout(formatFetchUpdates(updates));

    if (args.positionals[1] === undefined) {
      const hasTracking = await engine.resolve(`origin/${branch}`).then(
        () => true,
        () => false,
      );
      if (!hasTracking) {
        throw new GitOpError(
          "There is no tracking information for the current branch.\n" +
            "Please specify which branch you want to merge with.\n\n" +
            `    git pull origin <branch>`,
          1,
        );
      }
    }

    const before = await engine.resolve("HEAD");
    const outcome = await engine.merge(`origin/${branch}`, {
      message: `Merge remote-tracking branch 'origin/${branch}'`,
    });
    return printMergeOutcome(ctx, outcome, before);
  },
};
