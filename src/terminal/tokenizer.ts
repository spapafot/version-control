export class ShellParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellParseError";
  }
}

export interface Redirection {
  op: ">" | ">>";
  target: string;
}

export interface ParsedLine {
  argv: string[];
  redirect?: Redirection;
}

/**
 * Shell-style tokenizer: '…' and "…" quoting (Greek commit messages with
 * spaces), backslash escapes, and > / >> output redirection.
 * No pipes, env vars, or globbing — attempts get a clear error.
 */
export function tokenize(line: string): ParsedLine {
  const tokens: string[] = [];
  let cur = "";
  let hasCur = false;
  let i = 0;

  const push = () => {
    if (hasCur) {
      tokens.push(cur);
      cur = "";
      hasCur = false;
    }
  };

  while (i < line.length) {
    const ch = line[i];
    if (ch === "'") {
      const end = line.indexOf("'", i + 1);
      if (end === -1) throw new ShellParseError("syntax error: unclosed quote");
      cur += line.slice(i + 1, end);
      hasCur = true;
      i = end + 1;
    } else if (ch === '"') {
      i++;
      let closed = false;
      while (i < line.length) {
        const c = line[i];
        if (c === "\\" && i + 1 < line.length && '"\\'.includes(line[i + 1])) {
          cur += line[i + 1];
          i += 2;
        } else if (c === '"') {
          closed = true;
          i++;
          break;
        } else {
          cur += c;
          i++;
        }
      }
      if (!closed) throw new ShellParseError("syntax error: unclosed quote");
      hasCur = true;
    } else if (ch === "\\" && i + 1 < line.length) {
      cur += line[i + 1];
      hasCur = true;
      i += 2;
    } else if (ch === " " || ch === "\t") {
      push();
      i++;
    } else if (ch === ">") {
      push();
      if (line[i + 1] === ">") {
        tokens.push(">>");
        i += 2;
      } else {
        tokens.push(">");
        i++;
      }
    } else if (ch === "|" || ch === "&" || ch === ";" || ch === "<") {
      throw new ShellParseError(
        `syntax error near unexpected token '${ch}' (pipes and command chaining are not available here)`,
      );
    } else {
      cur += ch;
      hasCur = true;
      i++;
    }
  }
  push();

  const argv: string[] = [];
  let redirect: Redirection | undefined;
  for (let j = 0; j < tokens.length; j++) {
    const t = tokens[j];
    if (t === ">" || t === ">>") {
      const target = tokens[j + 1];
      if (!target || target === ">" || target === ">>")
        throw new ShellParseError("syntax error near unexpected token `newline'");
      if (redirect) throw new ShellParseError("syntax error: multiple redirections");
      redirect = { op: t, target };
      j++;
    } else {
      argv.push(t);
    }
  }
  return { argv, redirect };
}
