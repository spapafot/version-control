import type { RepoState } from "@/git/types";
import { plain, type Paint } from "./color";

/**
 * Renders `git status` exactly like real git (English, tab-indented paths).
 *
 * Colours follow git's own `color.status` defaults: staged entries green,
 * unstaged, untracked and unmerged ones red, everything else - headers, hints,
 * the branch line, the summary - left alone. As in git, the leading tab sits
 * outside the colour.
 */
export function formatStatus(state: RepoState, paint: Paint = plain): string {
  const lines: string[] = [];
  const detached = state.head.ref === null && state.head.oid !== null;
  lines.push(
    detached
      ? `HEAD detached at ${state.head.oid!.slice(0, 7)}`
      : `On branch ${state.head.ref ?? "main"}`,
  );

  // "Your branch is …" tracking line, exactly where real git puts it
  const hasTracking =
    !detached &&
    state.head.ref !== null &&
    state.head.oid !== null &&
    state.remote !== null &&
    state.remote.tracking.some((t) => t.name === state.head.ref);
  if (hasTracking) {
    const upstream = `'origin/${state.head.ref}'`;
    const ahead = state.remote!.ahead ?? 0;
    const behind = state.remote!.behind ?? 0;
    if (ahead === 0 && behind === 0) {
      lines.push(`Your branch is up to date with ${upstream}.`);
    } else if (ahead > 0 && behind === 0) {
      lines.push(
        `Your branch is ahead of ${upstream} by ${ahead} commit${ahead === 1 ? "" : "s"}.`,
      );
      lines.push('  (use "git push" to publish your local commits)');
    } else if (behind > 0 && ahead === 0) {
      lines.push(
        `Your branch is behind ${upstream} by ${behind} commit${behind === 1 ? "" : "s"}, and can be fast-forwarded.`,
      );
      lines.push('  (use "git pull" to update your local branch)');
    } else {
      lines.push(`Your branch and ${upstream} have diverged,`);
      lines.push(
        `and have ${ahead} and ${behind} different commits each, respectively.`,
      );
      lines.push(
        '  (use "git pull" if you want to integrate the remote branch with yours)',
      );
    }
  }

  if (state.head.oid === null) {
    lines.push("");
    lines.push("No commits yet");
  }

  const conflicted = state.status.filter((f) => f.conflicted);
  const staged = state.status.filter((f) => f.staged && !f.conflicted);
  const unstaged = state.status.filter((f) => f.unstaged && !f.conflicted);
  const untracked = state.status.filter(
    (f) => f.untracked && !f.staged && !f.conflicted,
  );

  if (state.merge.inProgress) {
    if (hasTracking) lines.push("");
    if (conflicted.length > 0) {
      lines.push("You have unmerged paths.");
      lines.push('  (fix conflicts and run "git commit")');
      lines.push('  (use "git merge --abort" to abort the merge)');
    } else {
      lines.push("All conflicts fixed but you are still merging.");
      lines.push('  (use "git commit" to conclude merge)');
    }
  }

  if (staged.length > 0) {
    lines.push("");
    lines.push("Changes to be committed:");
    lines.push('  (use "git restore --staged <file>..." to unstage)');
    for (const f of staged) {
      const label =
        f.staged === "added"
          ? "new file:"
          : f.staged === "deleted"
            ? "deleted:"
            : "modified:";
      lines.push(`\t${paint("green", `${label.padEnd(12)}${f.path}`)}`);
    }
  }

  if (conflicted.length > 0) {
    lines.push("");
    lines.push("Unmerged paths:");
    lines.push('  (use "git add <file>..." to mark resolution)');
    for (const f of conflicted) {
      lines.push(`\t${paint("red", `both modified:   ${f.path}`)}`);
    }
  }

  if (unstaged.length > 0) {
    lines.push("");
    lines.push("Changes not staged for commit:");
    lines.push('  (use "git add <file>..." to update what will be committed)');
    lines.push(
      '  (use "git restore <file>..." to discard changes in working directory)',
    );
    for (const f of unstaged) {
      const label = f.unstaged === "deleted" ? "deleted:" : "modified:";
      lines.push(`\t${paint("red", `${label.padEnd(12)}${f.path}`)}`);
    }
  }

  if (untracked.length > 0) {
    lines.push("");
    lines.push("Untracked files:");
    lines.push(
      '  (use "git add <file>..." to include in what will be committed)',
    );
    for (const f of untracked) {
      lines.push(`\t${paint("red", f.path)}`);
    }
  }

  // trailing summary
  const anyStaged = staged.length > 0 || conflicted.length > 0;
  if (
    !anyStaged &&
    unstaged.length === 0 &&
    untracked.length === 0 &&
    !state.merge.inProgress
  ) {
    if (state.head.oid === null) {
      lines.push("");
      lines.push(
        'nothing to commit (create/copy files and use "git add" to track)',
      );
    } else {
      if (hasTracking) lines.push("");
      lines.push("nothing to commit, working tree clean");
    }
  } else if (!anyStaged && unstaged.length > 0) {
    lines.push("");
    lines.push(
      'no changes added to commit (use "git add" and/or "git commit -a")',
    );
  } else if (!anyStaged && untracked.length > 0) {
    lines.push("");
    lines.push(
      'nothing added to commit but untracked files present (use "git add" to track)',
    );
  }

  return lines.join("\n");
}
