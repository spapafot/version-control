import * as git from "isomorphic-git";
import type { GitEngine } from "./engine";
import type { Persona } from "./types";
import { LEARNER } from "./engine";

/** Fixed author for scripted history — commits sort before any user commit. */
export const SETUP_AUTHOR: Persona = { name: "Alex", email: "alex@versioncontrol.gr" };

/** Epoch for scripted commits (Nov 2023) — far in the past of any user commit. */
export const SETUP_T0 = 1_700_000_000;

export type SetupStep =
  | { do: "file"; path: string; content: string }
  | { do: "init" }
  | { do: "add"; paths: string[] | "*" }
  | { do: "commit"; message: string }
  | { do: "branch"; name: string; at?: string }
  | { do: "switch"; ref: string }
  | { do: "merge"; ref: string }
  | { do: "reset"; mode: "soft" | "mixed" | "hard"; target: string }
  | { do: "detach"; back: number }
  | { do: "stash"; message?: string }
  | { do: "config"; key: string; value: string };

/**
 * Build a challenge's initial repository. Deterministic: fixed author and a
 * monotonic clock ⇒ byte-identical objects and stable hashes on every reset.
 */
export async function runSetup(engine: GitEngine, steps: SetupStep[]): Promise<void> {
  let n = 0;
  engine.clock = () => SETUP_T0 + 60 * ++n;
  engine.defaultAuthor = SETUP_AUTHOR;

  try {
    for (const step of steps) {
      switch (step.do) {
        case "file":
          await engine.writeFile(step.path, step.content);
          break;
        case "init":
          await engine.init("main");
          break;
        case "add":
          if (step.paths === "*") await engine.addAll();
          else for (const p of step.paths) await engine.add(p);
          break;
        case "commit":
          await engine.commit({ message: step.message });
          break;
        case "branch":
          await engine.branch(step.name, { startPoint: step.at });
          break;
        case "switch":
          await engine.switchTo(step.ref);
          break;
        case "merge":
          // a conflict outcome is a valid final state (user lands mid-conflict)
          await engine.merge(step.ref);
          break;
        case "reset":
          await engine.reset(step.mode, step.target);
          break;
        case "detach":
          await engine.detach(`HEAD~${step.back}`);
          break;
        case "stash":
          await engine.stashPush({ message: step.message });
          break;
        case "config":
          await git.setConfig({
            fs: engine.fsp.fs,
            dir: engine.dir,
            path: step.key,
            value: step.value,
          });
          break;
      }
    }
  } finally {
    engine.clock = null;
    engine.defaultAuthor = null;
  }

  // learner identity so the user's own commits never fail on missing config
  if (await engine.isInitialized()) {
    await git.setConfig({ fs: engine.fsp.fs, dir: engine.dir, path: "user.name", value: LEARNER.name });
    await git.setConfig({ fs: engine.fsp.fs, dir: engine.dir, path: "user.email", value: LEARNER.email });
  }
}
