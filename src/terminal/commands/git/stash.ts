import { GitOpError } from "@/git/errors";
import { formatStatus } from "../../format/status";
import type { ShellCommand } from "../types";

const USAGE = [
  "usage: git stash [push [-m <message>] [-u]]",
  "   or: git stash list",
  "   or: git stash apply|pop|drop [<stash>]",
  "   or: git stash clear",
].join("\n");

const SUBCOMMANDS = ["push", "list", "apply", "pop", "drop", "clear"] as const;
type StashOp = (typeof SUBCOMMANDS)[number];

export const STASH_SUBCOMMANDS: readonly string[] = SUBCOMMANDS;

const isOp = (s: string): s is StashOp => (SUBCOMMANDS as readonly string[]).includes(s);

/**
 * `git stash` — a sub-dispatcher: the shell hands us everything after `stash`,
 * so positionals[0] is the operation (default `push`) and positionals[1] the
 * `stash@{n}` reference.
 */
export const stash: ShellCommand = {
  spec: {
    flags: {
      message: { short: "m", long: "message", takesValue: true },
      includeUntracked: { short: "u", long: "include-untracked" },
    },
  },
  async run(ctx, args) {
    const engine = ctx.engine;
    const [first, ...rest] = args.positionals;

    let op: StashOp = "push";
    let refArg: string | undefined;
    if (first !== undefined) {
      if (!isOp(first)) {
        throw new GitOpError(`error: unknown subcommand: \`${first}'\n${USAGE}`, 129);
      }
      op = first;
      refArg = rest[0];
    }

    switch (op) {
      case "push": {
        const message = typeof args.flags.message === "string" ? args.flags.message : undefined;
        const result = await engine.stashPush({
          message,
          includeUntracked: Boolean(args.flags.includeUntracked),
        });
        if (!result.saved) {
          ctx.stdout("No local changes to save");
          return 0;
        }
        ctx.stdout(`Saved working directory and index state ${result.entry!.label}`);
        return 0;
      }

      case "list": {
        if (engine.stash.length > 0) {
          ctx.stdout(engine.stash.map((e, i) => `stash@{${i}}: ${e.label}`).join("\n"));
        }
        return 0;
      }

      case "apply": {
        await engine.stashApply(requireEntry(engine.stash.length, refArg));
        ctx.stdout(formatStatus(await engine.snapshot()));
        return 0;
      }

      case "pop": {
        const index = requireEntry(engine.stash.length, refArg);
        const entry = await engine.stashPop(index);
        ctx.stdout(formatStatus(await engine.snapshot()));
        ctx.stdout(`Dropped ${droppedName(refArg, index)} (${entry.oid})`);
        return 0;
      }

      case "drop": {
        const index = requireEntry(engine.stash.length, refArg);
        const entry = engine.stashDrop(index);
        ctx.stdout(`Dropped ${droppedName(refArg, index)} (${entry.oid})`);
        return 0;
      }

      case "clear": {
        engine.stashClear();
        return 0;
      }
    }
  },
};

/** `stash@{2}` / `2` → 2. Real git accepts both spellings. */
function requireEntry(count: number, refArg: string | undefined): number {
  if (count === 0) throw new GitOpError("No stash entries found.", 1);
  if (refArg === undefined) return 0;
  const match = refArg.match(/^(?:stash@\{(\d+)\}|(\d+))$/);
  if (!match) throw new GitOpError(`error: ${refArg} is not a valid reference`, 1);
  return parseInt(match[1] ?? match[2], 10);
}

/** Real git echoes back the reference you gave it, `refs/stash@{0}` by default. */
function droppedName(refArg: string | undefined, index: number): string {
  return refArg === undefined ? "refs/stash@{0}" : `stash@{${index}}`;
}
