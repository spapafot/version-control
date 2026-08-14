import type { RepoState } from "@/git/types";
import { gitCommands } from "./commands/git";
import { STASH_SUBCOMMANDS } from "./commands/git/stash";

const PLAIN = ["git", "ls", "cat", "touch", "mkdir", "mv", "cp", "rm", "echo", "clear", "help", "pwd"];
const GIT_SUBS = Object.keys(gitCommands);

/** Tab completion: command names, git subcommands, branches, files. */
export function makeCompleter(getState: () => RepoState | null) {
  return (tokens: string[], _partial: string): string[] => {
    const state = getState();
    if (tokens.length === 0) return PLAIN;
    if (tokens[0] === "git") {
      if (tokens.length === 1) return GIT_SUBS;
      const branches = state?.branches.map((b) => b.name) ?? [];
      const files = state?.workdir.map((f) => f.path) ?? [];
      const sub = tokens[1];
      if (sub === "stash") return [...STASH_SUBCOMMANDS];
      if (["switch", "merge", "branch"].includes(sub)) return branches;
      if (["fetch", "pull", "push"].includes(sub)) return ["origin", ...branches];
      if (["checkout"].includes(sub)) return [...branches, ...files];
      return files;
    }
    const paths = state?.workdir.map((f) => f.path) ?? [];
    const dirs = state?.dirs.map((d) => `${d}/`) ?? [];
    return [...paths, ...dirs];
  };
}
