import type { ShellCommand } from "./types";

export const clear: ShellCommand = {
  spec: { flags: {} },
  run(ctx) {
    ctx.clear?.();
    return 0;
  },
};

export const help: ShellCommand = {
  spec: { flags: {} },
  run(ctx) {
    ctx.stdout(
      [
        "Available commands:",
        "",
        "  git <command>     Git commands. Try `git help`",
        "  ls                List files",
        "  cat <file>        Print file contents",
        "  touch <file>      Create an empty file",
        "  rm <file>         Delete a file",
        "  echo <text>       Print text",
        "  echo <text> > f   Write text to a file (>> to append)",
        "  clear             Clear the screen",
        "",
        "Tip: the ↑/↓ arrows bring back previous commands, Tab autocompletes.",
      ].join("\n"),
    );
    return 0;
  },
};
