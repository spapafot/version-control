/**
 * ANSI colouring for command output, following git's own defaults.
 *
 * Deliberately the basic 30-37 codes rather than truecolor: TerminalPanel maps
 * those onto the CRT palette (green #3dff74, red #ff4d4d, cyan #35e0e0 …), so
 * the terminal keeps one colour scheme and a palette change reaches this for
 * free.
 *
 * Real git only colours when stdout is a terminal. Ours is one unless the line
 * redirected it into a file, which is why this is a painter handed to each
 * command through `ctx.paint` rather than a module of constants: escape codes
 * must never end up inside a file the learner then `cat`s.
 */

const SGR = {
  bold: 1,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
} as const;

export type Ink = keyof typeof SGR;

/** `paint("green", "…")`; a disabled painter returns the text untouched. */
export type Paint = (ink: Ink | Ink[], text: string) => string;

export function painter(enabled: boolean): Paint {
  return (ink, text) => {
    if (!enabled || text === "") return text;
    const codes = (Array.isArray(ink) ? ink : [ink]).map((i) => SGR[i]).join(";");
    return `\x1b[${codes}m${text}\x1b[0m`;
  };
}

/** for output that is not going to a terminal: redirection, tests, panels */
export const plain: Paint = painter(false);
