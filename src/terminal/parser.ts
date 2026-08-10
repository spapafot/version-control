import { GitOpError } from "@/git/errors";

export interface FlagSpec {
  short?: string;
  long?: string;
  takesValue?: boolean;
}

export interface CommandSpec {
  flags: Record<string, FlagSpec>;
}

export interface ParsedArgs {
  flags: Record<string, string | boolean | undefined>;
  positionals: string[];
}

/** git-flavored flag parsing: --long, --long=value, -s, clustered -am. */
export function parseArgs(argv: string[], spec: CommandSpec): ParsedArgs {
  const flags: ParsedArgs["flags"] = {};
  const positionals: string[] = [];
  const entries = Object.entries(spec.flags);
  const byLong = (name: string) => entries.find(([key, f]) => (f.long ?? key) === name);
  const byShort = (ch: string) => entries.find(([, f]) => f.short === ch);

  let afterDoubleDash = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (afterDoubleDash || tok === "-" || !tok.startsWith("-")) {
      positionals.push(tok);
      continue;
    }
    if (tok === "--") {
      afterDoubleDash = true;
      continue;
    }
    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const entry = byLong(name);
      if (!entry) throw new GitOpError(`error: unknown option \`${name}'`, 129);
      const [key, f] = entry;
      if (f.takesValue) {
        const value = eq !== -1 ? tok.slice(eq + 1) : argv[++i];
        if (value === undefined)
          throw new GitOpError(`error: option \`${name}' requires a value`, 129);
        flags[key] = value;
      } else {
        flags[key] = true;
      }
    } else {
      const cluster = tok.slice(1);
      for (let k = 0; k < cluster.length; k++) {
        const entry = byShort(cluster[k]);
        if (!entry) throw new GitOpError(`error: unknown switch \`${cluster[k]}'`, 129);
        const [key, f] = entry;
        if (f.takesValue) {
          const rest = cluster.slice(k + 1);
          const value = rest !== "" ? rest : argv[++i];
          if (value === undefined)
            throw new GitOpError(`error: switch \`${cluster[k]}' requires a value`, 129);
          flags[key] = value;
          break;
        }
        flags[key] = true;
      }
    }
  }
  return { flags, positionals };
}
