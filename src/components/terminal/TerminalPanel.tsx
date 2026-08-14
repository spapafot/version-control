"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { useGame } from "@/lib/game-store";
import { useProgress } from "@/lib/progress";
import { playError } from "@/lib/sound";
import { LineEditor } from "@/terminal/readline";
import { makeCompleter } from "@/terminal/complete";
import { renderPrompt } from "@/terminal/format/prompt";

/**
 * xterm.js host. Loaded client-side only (xterm touches `self` at module
 * scope); remounts whenever sessionId changes (challenge load / reset).
 */
export function TerminalPanel({ banner }: { banner?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sessionId = useGame((s) => s.sessionId);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let term: import("@xterm/xterm").Terminal | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;

      term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
        fontSize: 14,
        lineHeight: 1.25,
        scrollback: 1000,
        theme: {
          background: "#0a120c",
          foreground: "#c9e8ce",
          cursor: "#3dff74",
          cursorAccent: "#0a120c",
          selectionBackground: "#1c3322",
          black: "#0a120c",
          red: "#ff4d4d",
          green: "#3dff74",
          yellow: "#ffb000",
          blue: "#35e0e0",
          magenta: "#ff5ca8",
          cyan: "#35e0e0",
          white: "#c9e8ce",
          brightBlack: "#7ea98a",
          brightRed: "#ff8080",
          brightGreen: "#8affb0",
          brightYellow: "#ffd066",
          brightBlue: "#7fecec",
          brightMagenta: "#ff9cc8",
          brightCyan: "#7fecec",
          brightWhite: "#e8f5e9",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();

      observer = new ResizeObserver(() => {
        try {
          fit.fit();
        } catch {
          // host mid-layout; next tick will fit
        }
      });
      observer.observe(host);

      if (banner) term.write(banner.replace(/\n/g, "\r\n") + "\r\n\r\n");

      const editor = new LineEditor({
        term,
        prompt: () => renderPrompt(useGame.getState().state),
        complete: makeCompleter(() => useGame.getState().state),
        onLine: async (line) => {
          if (!term) return;
          const t = term;
          const code = await useGame.getState().execute(line, {
            stdout: (text) => t.write(text.replace(/\n/g, "\r\n") + "\r\n"),
            stderr: (text) => t.write(`\x1b[38;2;255;77;77m${text.replace(/\n/g, "\r\n")}\x1b[0m\r\n`),
            clear: () => t.write("\x1b[2J\x1b[H"),
          });
          if (code !== 0 && useProgress.getState().soundOn) playError();
        },
      });
      editor.start();
      term.onData((data) => editor.handleData(data));
      term.focus();
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      term?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div
      ref={hostRef}
      className="terminal-host h-full min-h-0 w-full cursor-text bg-panel"
      aria-label="Git terminal"
    />
  );
}
