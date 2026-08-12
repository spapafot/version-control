import { GitOpError } from "@/git/errors";
import { isReachable } from "@/git/queries";
import type { ShellCommand } from "../types";
import { printMergeOutcome, short } from "./helpers";

export const branch: ShellCommand = {
  spec: {
    flags: {
      delete: { short: "d", long: "delete" },
      forceDelete: { short: "D" },
    },
  },
  async run(ctx, args) {
    const engine = ctx.engine;
    const state = await engine.snapshot();

    if (args.flags.delete || args.flags.forceDelete) {
      const name = args.positionals[0];
      if (!name) throw new GitOpError("fatal: branch name required", 128);
      const target = state.branches.find((b) => b.name === name);
      if (!target) throw new GitOpError(`error: branch '${name}' not found.`);
      if (state.head.ref === name) {
        throw new GitOpError(`error: cannot delete branch '${name}' checked out at '${engine.dir}'`);
      }
      if (args.flags.delete && !args.flags.forceDelete) {
        const merged = isReachable(state.commits, state.head.oid, target.oid);
        if (!merged) {
          throw new GitOpError(
            `error: the branch '${name}' is not fully merged.\n` +
              `hint: If you are sure you want to delete it, run 'git branch -D ${name}'`,
          );
        }
      }
      await engine.deleteBranch(name);
      ctx.stdout(`Deleted branch ${name} (was ${short(target.oid)}).`);
      return 0;
    }

    if (args.positionals.length === 0) {
      // git colours the checked-out entry green (color.branch.current) and
      // leaves the "* " marker itself plain
      const detached =
        state.head.ref === null && state.head.oid !== null
          ? [`* ${ctx.paint("green", `(HEAD detached at ${state.head.oid.slice(0, 7)})`)}`]
          : [];
      const lines = [
        ...detached,
        ...state.branches.map((b) =>
          b.name === state.head.ref ? `* ${ctx.paint("green", b.name)}` : `  ${b.name}`,
        ),
      ].join("\n");
      if (lines) ctx.stdout(lines);
      return 0;
    }

    const [name, startPoint] = args.positionals;
    if (state.head.oid === null) {
      throw new GitOpError(`fatal: not a valid object name: '${state.head.ref ?? "main"}'`, 128);
    }
    await engine.branch(name, { startPoint });
    return 0;
  },
};

export const switchCmd: ShellCommand = {
  spec: {
    flags: {
      create: { short: "c", long: "create", takesValue: true },
      detach: { short: "d", long: "detach" },
    },
  },
  async run(ctx, args) {
    const engine = ctx.engine;
    if (args.flags.detach) {
      const target = args.positionals[0] ?? "HEAD";
      const oid = await engine.detach(target);
      ctx.stdout(await detachNotice(ctx, oid));
      return 0;
    }
    if (typeof args.flags.create === "string") {
      const name = args.flags.create;
      await engine.switchTo(name, { create: true, startPoint: args.positionals[0] });
      ctx.stdout(`Switched to a new branch '${name}'`);
      return 0;
    }
    const target = args.positionals[0];
    if (!target) throw new GitOpError("fatal: missing branch or commit argument", 128);
    const current = await engine.currentBranch();
    if (target === current) {
      ctx.stdout(`Already on '${target}'`);
      return 0;
    }
    await engine.switchTo(target);
    ctx.stdout(`Switched to branch '${target}'`);
    return 0;
  },
};

export const checkout: ShellCommand = {
  spec: { flags: { branch: { short: "b", takesValue: true } } },
  async run(ctx, args) {
    const engine = ctx.engine;
    if (typeof args.flags.branch === "string") {
      const name = args.flags.branch;
      await engine.switchTo(name, { create: true, startPoint: args.positionals[0] });
      ctx.stdout(`Switched to a new branch '${name}'`);
      return 0;
    }
    const target = args.positionals[0];
    if (!target) throw new GitOpError("fatal: you must specify a branch or file", 128);

    const branches = await engine.listBranches();
    if (branches.includes(target)) {
      const current = await engine.currentBranch();
      if (target === current) {
        ctx.stdout(`Already on '${target}'`);
        return 0;
      }
      await engine.switchTo(target);
      ctx.stdout(`Switched to branch '${target}'`);
      return 0;
    }
    // a commit-ish? → detached HEAD (unless it names a workdir file)
    const isFile = await engine.exists(`${engine.dir}/${target}`);
    if (!isFile) {
      let oid: string | null = null;
      try {
        oid = await engine.resolve(target);
      } catch {
        // not a revision either — fall through to the file-restore path
      }
      if (oid) {
        await engine.detach(oid);
        ctx.stdout(await detachNotice(ctx, oid));
        return 0;
      }
    }

    // `git checkout -- <files>` / `git checkout <file>`: restore from index
    const files = args.positionals;
    await engine.restore(files, { staged: false, worktree: true });
    return 0;
  },
};

async function detachNotice(
  ctx: Parameters<ShellCommand["run"]>[0],
  oid: string,
): Promise<string> {
  const state = await ctx.engine.snapshot();
  const msg = state.commits.find((c) => c.oid === oid)?.message.split("\n")[0] ?? "";
  return (
    `Note: switching to '${short(oid)}'.\n\n` +
    "You are in 'detached HEAD' state. You can look around, but any branch\n" +
    "you want to keep should be created with: git switch -c <new-branch-name>\n\n" +
    `HEAD is now at ${short(oid)} ${msg}`
  );
}

export const merge: ShellCommand = {
  spec: { flags: { abort: { long: "abort" } } },
  async run(ctx, args) {
    const engine = ctx.engine;
    if (args.flags.abort) {
      await engine.abortMerge();
      return 0;
    }
    const target = args.positionals[0];
    if (!target) {
      throw new GitOpError("fatal: No remote for the current branch.", 128);
    }
    const before = await engine.resolve("HEAD");
    const outcome = await engine.merge(target);
    return printMergeOutcome(ctx, outcome, before);
  },
};
