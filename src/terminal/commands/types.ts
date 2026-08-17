import type { GitEngine } from "@/git/engine";
import type { Paint } from "../format/color";
import type { CommandSpec, ParsedArgs } from "../parser";

export interface CommandContext {
  engine: GitEngine;
  /** println semantics - a trailing newline is added per call */
  stdout(text: string): void;
  stderr(text: string): void;
  clear?: () => void;
  /** git's isatty rule: colours go dead once stdout is redirected to a file */
  paint: Paint;
}

export interface ShellCommand {
  spec: CommandSpec;
  /** bypass flag parsing (echo) - args.positionals receives raw argv */
  rawArgs?: boolean;
  run(ctx: CommandContext, args: ParsedArgs): Promise<number> | number;
}
