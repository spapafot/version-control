import * as git from "isomorphic-git";
import { GitEngine } from "./engine";
import type { Persona } from "./types";
import { LEARNER } from "./engine";
import { mirrorToOrigin, REMOTE_AUTHOR, REMOTE_DIR } from "./ops/remote";

/** Fixed author for scripted history - commits sort before any user commit. */
export const SETUP_AUTHOR: Persona = {
  name: "Alex",
  email: "alex@versioncontrol.gr",
};

/** Epoch for scripted commits (Nov 2023) - far in the past of any user commit. */
export const SETUP_T0 = 1_700_000_000;

export type SetupStep =
  | { do: "file"; path: string; content: string }
  | { do: "init" }
  | { do: "add"; paths: string[] | "*" }
  | { do: "commit"; message: string }
  | { do: "branch"; name: string; at?: string }
  | { do: "deleteBranch"; name: string }
  | { do: "switch"; ref: string }
  | { do: "merge"; ref: string }
  | { do: "reset"; mode: "soft" | "mixed" | "hard"; target: string }
  | { do: "detach"; back: number }
  | { do: "stash"; message?: string }
  | { do: "config"; key: string; value: string }
  /** mirror the current branch onto the simulated origin (creates it on first use) */
  | { do: "publish" }
  /** run steps against the origin repo - Maria working "from her laptop" */
  | { do: "onRemote"; steps: SetupStep[] };

/** One plain step against one engine. `publish`/`onRemote` are top-level only. */
async function applyStep(target: GitEngine, step: SetupStep): Promise<void> {
  switch (step.do) {
    case "file":
      await target.writeFile(step.path, step.content);
      break;
    case "init":
      await target.init("main");
      break;
    case "add":
      if (step.paths === "*") await target.addAll();
      else for (const p of step.paths) await target.add(p);
      break;
    case "commit":
      await target.commit({ message: step.message });
      break;
    case "branch":
      await target.branch(step.name, { startPoint: step.at });
      break;
    case "deleteBranch":
      await target.deleteBranch(step.name);
      break;
    case "switch":
      await target.switchTo(step.ref);
      break;
    case "merge":
      // a conflict outcome is a valid final state (user lands mid-conflict)
      await target.merge(step.ref);
      break;
    case "reset":
      await target.reset(step.mode, step.target);
      break;
    case "detach":
      await target.detach(`HEAD~${step.back}`);
      break;
    case "stash":
      await target.stashPush({ message: step.message });
      break;
    case "config":
      await git.setConfig({
        fs: target.fsp.fs,
        dir: target.dir,
        path: step.key,
        value: step.value,
      });
      break;
    case "publish":
    case "onRemote":
      throw new Error(`setup: '${step.do}' cannot be nested inside onRemote`);
  }
}

/**
 * Build a challenge's initial repository. Deterministic: fixed author and a
 * monotonic clock ⇒ byte-identical objects and stable hashes on every reset.
 * The origin engine (when published) shares the SAME clock closure, so remote
 * scenarios reset to identical oids too.
 */
export async function runSetup(
  engine: GitEngine,
  steps: SetupStep[],
): Promise<void> {
  let n = 0;
  const tick = () => SETUP_T0 + 60 * ++n;
  engine.clock = tick;
  engine.defaultAuthor = SETUP_AUTHOR;

  try {
    for (const step of steps) {
      switch (step.do) {
        case "publish": {
          if (
            (await engine.currentBranch()) === null ||
            !(await engine.isInitialized())
          ) {
            throw new Error(
              "setup: 'publish' needs an initialized repo on a branch",
            );
          }
          if (!engine.remote) {
            const origin = new GitEngine(engine.fsp, REMOTE_DIR);
            await origin.init("main");
            origin.clock = tick; // shared counter - deterministic interleaving
            origin.defaultAuthor = REMOTE_AUTHOR;
            engine.remote = origin;
          }
          await mirrorToOrigin(engine, (await engine.currentBranch())!);
          break;
        }
        case "onRemote": {
          if (!engine.remote)
            throw new Error("setup: 'onRemote' before 'publish'");
          for (const s of step.steps) await applyStep(engine.remote, s);
          break;
        }
        default:
          await applyStep(engine, step);
      }
    }
  } finally {
    engine.clock = null;
    engine.defaultAuthor = null;
    if (engine.remote) {
      engine.remote.clock = null;
      engine.remote.defaultAuthor = null;
    }
  }

  // learner identity so the user's own commits never fail on missing config
  if (await engine.isInitialized()) {
    await git.setConfig({
      fs: engine.fsp.fs,
      dir: engine.dir,
      path: "user.name",
      value: LEARNER.name,
    });
    await git.setConfig({
      fs: engine.fsp.fs,
      dir: engine.dir,
      path: "user.email",
      value: LEARNER.email,
    });
  }
}
