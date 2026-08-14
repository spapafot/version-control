export interface TermLike {
  write(data: string): void;
}

export interface LineEditorOptions {
  term: TermLike;
  /** a function is re-read on every draw, so a branch-aware prompt follows `git switch` */
  prompt: string | (() => string);
  onLine(line: string): Promise<void> | void;
  /** completion candidates for the token being typed */
  complete?(tokens: string[], partial: string): string[];
}

/**
 * Minimal readline on top of a dumb terminal: history, cursor editing,
 * Ctrl+C/L, tab completion. xterm-agnostic (tested against a string sink).
 */
export class LineEditor {
  private buf = "";
  private pos = 0;
  private history: string[] = [];
  private histIdx = -1;
  private draft = "";
  private busy = false;
  private queue = "";

  constructor(private opts: LineEditorOptions) {}

  private get prompt(): string {
    const { prompt } = this.opts;
    return typeof prompt === "function" ? prompt() : prompt;
  }

  start(): void {
    this.opts.term.write(this.prompt);
  }

  handleData(data: string): void {
    this.queue += data;
    if (!this.busy) void this.drain();
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0 && !this.busy) {
      const data = this.queue;
      this.queue = "";
      let i = 0;
      while (i < data.length) {
        i += await this.handleChunk(data, i);
        if (this.busy) {
          // a command is running; keep the rest for later
          this.queue = data.slice(i) + this.queue;
          return;
        }
      }
    }
  }

  /** returns number of consumed chars */
  private async handleChunk(data: string, i: number): Promise<number> {
    const ch = data[i];

    if (ch === "\x1b") {
      const rest = data.slice(i);
      const seq = rest.match(/^\x1b\[([A-HF~0-9;]*)?[A-Za-z~]/)?.[0];
      if (!seq) return 1;
      this.handleEscape(seq);
      return seq.length;
    }

    switch (ch) {
      case "\r":
      case "\n":
        await this.submit();
        return data[i + 1] === "\n" && ch === "\r" ? 2 : 1;
      case "\x7f": // backspace
        if (this.pos > 0) {
          this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos);
          this.pos--;
          this.render();
        }
        return 1;
      case "\x03": // Ctrl+C
        this.opts.term.write("^C\r\n");
        this.buf = "";
        this.pos = 0;
        this.histIdx = -1;
        this.opts.term.write(this.prompt);
        return 1;
      case "\x0c": // Ctrl+L
        this.opts.term.write("\x1b[2J\x1b[H");
        this.render();
        return 1;
      case "\x01": // Ctrl+A
        this.pos = 0;
        this.render();
        return 1;
      case "\x05": // Ctrl+E
        this.pos = this.buf.length;
        this.render();
        return 1;
      case "\x15": // Ctrl+U
        this.buf = this.buf.slice(this.pos);
        this.pos = 0;
        this.render();
        return 1;
      case "\t":
        this.completeToken();
        return 1;
    }

    if (ch >= " " || ch.charCodeAt(0) > 127) {
      // batch consecutive printable chars (fast paste path)
      let j = i;
      while (
        j < data.length &&
        (data[j] >= " " || data[j].charCodeAt(0) > 127) &&
        data[j] !== "\x7f"
      ) {
        j++;
      }
      const text = data.slice(i, j);
      this.buf = this.buf.slice(0, this.pos) + text + this.buf.slice(this.pos);
      this.pos += text.length;
      this.render();
      return j - i;
    }
    return 1;
  }

  private handleEscape(seq: string): void {
    switch (seq) {
      case "\x1b[A": // up
        if (this.history.length === 0) return;
        if (this.histIdx === -1) {
          this.draft = this.buf;
          this.histIdx = this.history.length - 1;
        } else if (this.histIdx > 0) {
          this.histIdx--;
        }
        this.buf = this.history[this.histIdx];
        this.pos = this.buf.length;
        this.render();
        return;
      case "\x1b[B": // down
        if (this.histIdx === -1) return;
        if (this.histIdx < this.history.length - 1) {
          this.histIdx++;
          this.buf = this.history[this.histIdx];
        } else {
          this.histIdx = -1;
          this.buf = this.draft;
        }
        this.pos = this.buf.length;
        this.render();
        return;
      case "\x1b[C": // right
        if (this.pos < this.buf.length) {
          this.pos++;
          this.render();
        }
        return;
      case "\x1b[D": // left
        if (this.pos > 0) {
          this.pos--;
          this.render();
        }
        return;
      case "\x1b[H":
      case "\x1b[1~":
        this.pos = 0;
        this.render();
        return;
      case "\x1b[F":
      case "\x1b[4~":
        this.pos = this.buf.length;
        this.render();
        return;
      case "\x1b[3~": // delete
        if (this.pos < this.buf.length) {
          this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
          this.render();
        }
        return;
    }
  }

  private render(): void {
    const { term } = this.opts;
    term.write("\r\x1b[K" + this.prompt + this.buf);
    const back = this.buf.length - this.pos;
    if (back > 0) term.write(`\x1b[${back}D`);
  }

  private async submit(): Promise<void> {
    const line = this.buf;
    this.opts.term.write("\r\n");
    this.buf = "";
    this.pos = 0;
    this.histIdx = -1;
    this.draft = "";
    const trimmed = line.trim();
    if (trimmed && this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
      if (this.history.length > 100) this.history.shift();
    }
    this.busy = true;
    try {
      await this.opts.onLine(line);
    } finally {
      this.busy = false;
      // after onLine: the store already holds the post-command snapshot, so a
      // `git switch` shows up in the very next prompt
      this.opts.term.write(this.prompt);
      void this.drain();
    }
  }

  private completeToken(): void {
    if (!this.opts.complete) return;
    const before = this.buf.slice(0, this.pos);
    const tokens = before.split(/\s+/).filter((t) => t.length > 0);
    const endsWithSpace = /\s$/.test(before) || before === "";
    const partial = endsWithSpace ? "" : (tokens[tokens.length - 1] ?? "");
    const context = endsWithSpace ? tokens : tokens.slice(0, -1);
    const candidates = this.opts.complete(context, partial).filter((c) =>
      c.startsWith(partial),
    );
    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      const insert = candidates[0].slice(partial.length) + " ";
      this.buf = this.buf.slice(0, this.pos) + insert + this.buf.slice(this.pos);
      this.pos += insert.length;
      this.render();
      return;
    }
    // common prefix extension, then list
    const common = commonPrefix(candidates);
    if (common.length > partial.length) {
      const insert = common.slice(partial.length);
      this.buf = this.buf.slice(0, this.pos) + insert + this.buf.slice(this.pos);
      this.pos += insert.length;
    }
    this.opts.term.write("\r\n" + candidates.join("  ") + "\r\n");
    this.render();
  }
}

function commonPrefix(items: string[]): string {
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
