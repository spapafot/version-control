import type { GitEngine } from "@/git/engine";
import { GitOpError } from "@/git/errors";
import { ShellParseError, tokenize } from "./tokenizer";
import { painter } from "./format/color";
import { parseArgs } from "./parser";
import type { CommandContext, ShellCommand } from "./commands/types";
import { gitCommands, GIT_USAGE } from "./commands/git";
import { cat, echo, ls, pwd, rm, touch } from "./commands/fs";
import { clear, help } from "./commands/misc";

const plainCommands: Record<string, ShellCommand> = {
  ls,
  cat,
  touch,
  rm,
  echo,
  pwd,
  clear,
  help,
};

export interface ShellIO {
  stdout(text: string): void;
  stderr(text: string): void;
  clear?: () => void;
}

export class Shell {
  constructor(readonly engine: GitEngine) {}

  async execute(line: string, io: ShellIO): Promise<number> {
    let argv: string[];
    let redirect: ReturnType<typeof tokenize>["redirect"];
    try {
      ({ argv, redirect } = tokenize(line));
    } catch (e) {
      if (e instanceof ShellParseError) {
        io.stderr(e.message);
        return 2;
      }
      throw e;
    }
    if (argv.length === 0) return 0;

    let buffer = "";
    const ctx: CommandContext = {
      engine: this.engine,
      stdout: redirect ? (t) => (buffer += t + "\n") : io.stdout,
      stderr: io.stderr,
      clear: io.clear,
      // `git status > out.txt` must write plain text, exactly as real git does
      // when stdout is not a terminal
      paint: painter(!redirect),
    };

    try {
      const code = await this.dispatch(ctx, argv);
      if (redirect) {
        let existing = "";
        if (redirect.op === ">>" && (await this.engine.exists(`${this.engine.dir}/${redirect.target}`))) {
          existing = await this.engine.readFile(redirect.target);
        }
        await this.engine.writeFile(redirect.target, existing + buffer);
      }
      return code;
    } catch (e) {
      if (e instanceof GitOpError) {
        io.stderr(e.message);
        return e.exitCode;
      }
      io.stderr(`internal error: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }

  private async dispatch(ctx: CommandContext, argv: string[]): Promise<number> {
    const [cmd, ...rest] = argv;

    if (cmd === "git") {
      const sub = rest[0];
      if (!sub || sub === "help" || sub === "--help") {
        ctx.stdout(GIT_USAGE);
        return sub ? 0 : 1;
      }
      const command = gitCommands[sub];
      if (!command) {
        ctx.stderr(`git: '${sub}' is not a git command. See 'git help'.`);
        return 1;
      }
      if (sub !== "init") await ctx.engine.requireRepo();
      const args = command.rawArgs
        ? { flags: {}, positionals: rest.slice(1) }
        : parseArgs(rest.slice(1), command.spec);
      return command.run(ctx, args);
    }

    const command = plainCommands[cmd];
    if (!command) {
      ctx.stderr(`${cmd}: command not found (try \`help\`)`);
      return 127;
    }
    const args = command.rawArgs
      ? { flags: {}, positionals: rest }
      : parseArgs(rest, command.spec);
    return command.run(ctx, args);
  }
}
