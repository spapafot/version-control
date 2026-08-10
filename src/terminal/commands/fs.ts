import type { ShellCommand } from "./types";

export const ls: ShellCommand = {
  spec: { flags: {} },
  async run(ctx) {
    const entries: string[] = await ctx.engine.fsp.promises.readdir(ctx.engine.dir);
    const shown: string[] = [];
    for (const e of entries.sort()) {
      if (e === ".git") continue;
      const stat = await ctx.engine.fsp.promises.stat(`${ctx.engine.dir}/${e}`);
      shown.push(stat.isDirectory() ? `${e}/` : e);
    }
    if (shown.length > 0) ctx.stdout(shown.join("  "));
    return 0;
  },
};

export const cat: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      ctx.stderr("cat: missing file operand");
      return 1;
    }
    let code = 0;
    for (const f of args.positionals) {
      try {
        const content: string = await ctx.engine.readFile(f);
        ctx.stdout(content.replace(/\n$/, ""));
      } catch {
        ctx.stderr(`cat: ${f}: No such file or directory`);
        code = 1;
      }
    }
    return code;
  },
};

export const touch: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      ctx.stderr("touch: missing file operand");
      return 1;
    }
    for (const f of args.positionals) {
      if (!(await ctx.engine.exists(`${ctx.engine.dir}/${f}`))) {
        await ctx.engine.writeFile(f, "");
      }
    }
    return 0;
  },
};

export const rm: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      ctx.stderr("rm: missing operand");
      return 1;
    }
    let code = 0;
    for (const f of args.positionals) {
      try {
        await ctx.engine.deleteFile(f);
      } catch {
        ctx.stderr(`rm: cannot remove '${f}': No such file or directory`);
        code = 1;
      }
    }
    return code;
  },
};

export const echo: ShellCommand = {
  spec: { flags: {} },
  rawArgs: true,
  run(ctx, args) {
    ctx.stdout(args.positionals.join(" "));
    return 0;
  },
};

export const pwd: ShellCommand = {
  spec: { flags: {} },
  run(ctx) {
    ctx.stdout(ctx.engine.dir);
    return 0;
  },
};
