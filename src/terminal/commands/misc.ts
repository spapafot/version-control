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
        "  pwd               Print where you are",
        "  ls [folder]       List files",
        "  cat <file>        Print file contents",
        "  touch <file>      Create an empty file",
        "  mkdir <folder>    Create a folder",
        "  mv <from> <to>    Move or rename a file or folder",
        "  cp <from> <to>    Copy a file",
        "  rm [-r] <path>    Delete a file (or a folder with -r)",
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
