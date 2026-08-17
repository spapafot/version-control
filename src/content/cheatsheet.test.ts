import { describe, expect, it } from "vitest";
import { challengeBySlug } from "@/challenges";
import { gitCommands } from "@/terminal/commands/git";
import { CHEATSHEET } from "./cheatsheet";

const entries = CHEATSHEET.flatMap((g) => g.entries);

/**
 * A cheat sheet that documents commands the terminal rejects is worse than no
 * cheat sheet, so it is pinned to the engine's actual command table.
 */
describe("cheatsheet", () => {
  it("documents every git command the engine implements", () => {
    expect(entries.map((e) => e.name).sort()).toEqual(
      Object.keys(gitCommands).sort(),
    );
  });

  it("links each command to a mission that exists", () => {
    for (const e of entries) {
      expect(
        challengeBySlug.has(e.mission),
        `${e.command} points at "${e.mission}"`,
      ).toBe(true);
    }
  });

  it("gives every command at least one example", () => {
    for (const e of entries) {
      expect(e.examples.length, `${e.command} has no examples`).toBeGreaterThan(
        0,
      );
      for (const ex of e.examples) {
        expect(
          ex.code.startsWith("git "),
          `${ex.code} is not a git command`,
        ).toBe(true);
      }
    }
  });

  it("uses no em dashes or curly quotes in the prose", () => {
    const prose = [
      ...CHEATSHEET.map((g) => `${g.title} ${g.intro}`),
      ...entries.flatMap((e) => [e.summary, ...e.examples.map((x) => x.note)]),
    ].join(" ");
    expect(prose).not.toMatch(/[-–“”‘’]/);
  });
});
