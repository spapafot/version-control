import type { CommandContext, ShellCommand } from "./types";

/**
 * Collapse a user-typed path to a repo-relative one: strips trailing slashes,
 * resolves `.`/`..` segments, and never escapes the sandbox root - `..` at the
 * top collapses to the root itself (there is no cd in this course).
 */
function collapse(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

const basename = (p: string) => {
  const n = collapse(p);
  return n.slice(n.lastIndexOf("/") + 1);
};

function absOf(ctx: CommandContext, rel: string): string {
  return rel ? `${ctx.engine.dir}/${rel}` : ctx.engine.dir;
}

async function listOne(ctx: CommandContext, absDir: string): Promise<string> {
  const entries: string[] = await ctx.engine.fsp.promises.readdir(absDir);
  const shown: string[] = [];
  for (const e of entries.sort()) {
    if (e === ".git") continue;
    const stat = await ctx.engine.fsp.promises.stat(`${absDir}/${e}`);
    shown.push(stat.isDirectory() ? `${e}/` : e);
  }
  return shown.join("  ");
}

export const ls: ShellCommand = {
  spec: { flags: {} },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      const line = await listOne(ctx, ctx.engine.dir);
      if (line) ctx.stdout(line);
      return 0;
    }
    let code = 0;
    const files: string[] = [];
    const dirs: string[] = [];
    for (const p of args.positionals) {
      const rel = collapse(p);
      if (!(await ctx.engine.exists(absOf(ctx, rel)))) {
        ctx.stderr(`ls: cannot access '${p}': No such file or directory`);
        code = 2;
      } else if (rel === "" || (await ctx.engine.isDirectory(rel))) {
        dirs.push(p);
      } else {
        files.push(p);
      }
    }
    if (files.length > 0) ctx.stdout(files.join("  "));
    const headers = args.positionals.length > 1;
    let blocks = files.length > 0 ? 1 : 0;
    for (const d of dirs) {
      if (headers && blocks > 0) ctx.stdout("");
      if (headers) ctx.stdout(`${d}:`);
      const line = await listOne(ctx, absOf(ctx, collapse(d)));
      if (line) ctx.stdout(line);
      blocks++;
    }
    return code;
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
      if (await ctx.engine.isDirectory(collapse(f))) {
        ctx.stderr(`cat: ${f}: Is a directory`);
        code = 1;
        continue;
      }
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

export const mkdir: ShellCommand = {
  spec: { flags: { parents: { short: "p", long: "parents" } } },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      ctx.stderr("mkdir: missing operand");
      return 1;
    }
    let code = 0;
    for (const d of args.positionals) {
      try {
        await ctx.engine.makeDir(collapse(d), {
          parents: Boolean(args.flags.parents),
        });
      } catch (e: any) {
        const why =
          e?.code === "EEXIST" ? "File exists" : "No such file or directory";
        ctx.stderr(`mkdir: cannot create directory '${d}': ${why}`);
        code = 1;
      }
    }
    return code;
  },
};

export const rm: ShellCommand = {
  spec: { flags: { recursive: { short: "r", long: "recursive" } } },
  async run(ctx, args) {
    if (args.positionals.length === 0) {
      ctx.stderr("rm: missing operand");
      return 1;
    }
    let code = 0;
    for (const f of args.positionals) {
      const rel = collapse(f);
      if (rel === "") {
        ctx.stderr(
          `rm: refusing to remove '.' or '..' directory: skipping '${f}'`,
        );
        code = 1;
        continue;
      }
      if (!(await ctx.engine.exists(absOf(ctx, rel)))) {
        ctx.stderr(`rm: cannot remove '${f}': No such file or directory`);
        code = 1;
        continue;
      }
      if (await ctx.engine.isDirectory(rel)) {
        if (!args.flags.recursive) {
          ctx.stderr(`rm: cannot remove '${f}': Is a directory`);
          code = 1;
          continue;
        }
        await ctx.engine.deleteDir(rel);
      } else {
        await ctx.engine.deleteFile(rel);
      }
    }
    return code;
  },
};

async function moveOrCopy(
  ctx: CommandContext,
  positionals: string[],
  tool: "mv" | "cp",
): Promise<number> {
  if (positionals.length === 0) {
    ctx.stderr(`${tool}: missing file operand`);
    return 1;
  }
  if (positionals.length === 1) {
    ctx.stderr(
      `${tool}: missing destination file operand after '${positionals[0]}'`,
    );
    return 1;
  }
  const engine = ctx.engine;
  const dest = positionals[positionals.length - 1];
  const sources = positionals.slice(0, -1);
  const destRel = collapse(dest);
  const destIsDir = destRel === "" || (await engine.isDirectory(destRel));
  if (sources.length > 1 && !destIsDir) {
    ctx.stderr(`${tool}: target '${dest}' is not a directory`);
    return 1;
  }
  let code = 0;
  for (const src of sources) {
    const srcRel = collapse(src);
    if (!(await engine.exists(absOf(ctx, srcRel)))) {
      ctx.stderr(`${tool}: cannot stat '${src}': No such file or directory`);
      code = 1;
      continue;
    }
    const srcIsDir = await engine.isDirectory(srcRel);
    // a trailing slash promises the target is a directory - only a directory
    // source may still claim that name as a rename (real mv semantics)
    if (!destIsDir && dest.endsWith("/") && !srcIsDir) {
      ctx.stderr(
        tool === "mv"
          ? `mv: cannot move '${src}' to '${dest}': Not a directory`
          : `cp: cannot create regular file '${dest}': Not a directory`,
      );
      code = 1;
      continue;
    }
    const final = destIsDir ? collapse(`${destRel}/${basename(src)}`) : destRel;
    if (final === srcRel) {
      ctx.stderr(`${tool}: '${src}' and '${final}' are the same file`);
      code = 1;
      continue;
    }
    if (srcIsDir) {
      if (tool === "cp") {
        ctx.stderr(`cp: -r not specified; omitting directory '${src}'`);
        code = 1;
        continue;
      }
      if (final.startsWith(`${srcRel}/`)) {
        ctx.stderr(
          `mv: cannot move '${src}' to a subdirectory of itself, '${final}'`,
        );
        code = 1;
        continue;
      }
      if (
        (await engine.exists(absOf(ctx, final))) &&
        !(await engine.isDirectory(final))
      ) {
        ctx.stderr(
          `mv: cannot overwrite non-directory '${final}' with directory '${src}'`,
        );
        code = 1;
        continue;
      }
      await engine.makeDir(final, { parents: true });
      for (const f of await engine.listFilesUnder(srcRel)) {
        await engine.writeFile(
          `${final}/${f}`,
          await engine.readFile(`${srcRel}/${f}`),
        );
      }
      await engine.deleteDir(srcRel);
      continue;
    }
    const content = await engine.readFile(srcRel);
    await engine.writeFile(final, content);
    if (tool === "mv") await engine.deleteFile(srcRel);
  }
  return code;
}

export const mv: ShellCommand = {
  spec: { flags: {} },
  run(ctx, args) {
    return moveOrCopy(ctx, args.positionals, "mv");
  },
};

export const cp: ShellCommand = {
  spec: { flags: {} },
  run(ctx, args) {
    return moveOrCopy(ctx, args.positionals, "cp");
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
