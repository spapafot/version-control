import * as git from "isomorphic-git";
import type { FsProvider } from "./fs";
import { GitOpError } from "./errors";
import type { MergeOutcome, MergeState, Persona, RepoState } from "./types";
import { buildRepoState } from "./state";
import { reset as resetOp } from "./ops/reset";
import { revert as revertOp } from "./ops/revert";
import { cherryPick as cherryPickOp } from "./ops/cherry-pick";
import { restore as restoreOp } from "./ops/restore";
import { switchBranch } from "./ops/switch";
import {
  stashApply,
  stashDrop,
  stashPop,
  stashPush,
  type StashEntry,
  type StashPushResult,
} from "./ops/stash";
import { revparse } from "./revparse";

/** Fallback identity so `git commit` never fails on missing config (as if a global config existed). */
export const LEARNER: Persona = { name: "dev", email: "dev@versioncontrol.gr" };

export interface ReflogEntry {
  oid: string;
  action: string; // e.g. `commit: <msg>`, `reset: moving to HEAD~2`
  timestamp: number;
}

export class GitEngine {
  readonly dir = "/repo";
  readonly fsp: FsProvider;
  /** isomorphic-git object cache — MUST die together with the volume */
  cache: object = {};
  mergeState: MergeState | null = null;
  /** HEAD reflog, newest first. In-memory only: engines are rebuilt per challenge. */
  reflog: ReflogEntry[] = [];
  /** stash stack, newest first (stash@{0}). In-memory, like the reflog. */
  stash: StashEntry[] = [];
  /** deterministic clock installed by the challenge-setup runner */
  clock: (() => number) | null = null;
  /** author override installed by the challenge-setup runner */
  defaultAuthor: Persona | null = null;
  /**
   * Monotonic mtime for every write. statusMatrix trusts stats (size+mtime)
   * to skip hashing; same-size writes in the same millisecond would otherwise
   * be invisible (racy index). Unique mtimes force a real content compare.
   */
  private mtimeTick = 1_600_000_000;

  constructor(fsp: FsProvider) {
    this.fsp = fsp;
    this.fsp.fs.mkdirSync(this.dir, { recursive: true });
  }

  private get common() {
    return { fs: this.fsp.fs, dir: this.dir, cache: this.cache };
  }

  // ── plumbing helpers ────────────────────────────────────────────────

  async isInitialized(): Promise<boolean> {
    return this.exists(`${this.dir}/.git`);
  }

  async exists(absPath: string): Promise<boolean> {
    try {
      await this.fsp.promises.stat(absPath);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(relPath: string): Promise<string> {
    return this.fsp.promises.readFile(`${this.dir}/${relPath}`, "utf8");
  }

  async writeFile(relPath: string, content: string): Promise<void> {
    const abs = `${this.dir}/${relPath}`;
    const parent = abs.slice(0, abs.lastIndexOf("/"));
    await this.fsp.promises.mkdir(parent, { recursive: true });
    await this.fsp.promises.writeFile(abs, content, "utf8");
    const t = ++this.mtimeTick;
    await this.fsp.promises.utimes(abs, t, t);
  }

  async deleteFile(relPath: string): Promise<void> {
    await this.fsp.promises.unlink(`${this.dir}/${relPath}`);
  }

  async author(): Promise<Persona> {
    if (this.defaultAuthor) return this.defaultAuthor;
    const name = await git.getConfig({ ...this.common, path: "user.name" });
    const email = await git.getConfig({ ...this.common, path: "user.email" });
    return name && email ? { name, email } : LEARNER;
  }

  timestamp(): number {
    return this.clock ? this.clock() : Math.floor(Date.now() / 1000);
  }

  recordReflog(oid: string, action: string, timestamp?: number): void {
    this.reflog.unshift({ oid, action, timestamp: timestamp ?? this.timestamp() });
  }

  async resolve(revish: string): Promise<string> {
    return revparse(this, revish);
  }

  async currentBranch(): Promise<string | null> {
    const b = await git.currentBranch({ ...this.common, fullname: false });
    return b ?? null;
  }

  async listBranches(): Promise<string[]> {
    return git.listBranches(this.common);
  }

  async statusMatrix() {
    return git.statusMatrix(this.common);
  }

  requireRepo(): Promise<void> {
    return this.isInitialized().then((ok) => {
      if (!ok)
        throw new GitOpError(
          "fatal: not a git repository (or any of the parent directories): .git",
          128,
        );
    });
  }

  // ── porcelain ───────────────────────────────────────────────────────

  async init(defaultBranch = "main"): Promise<void> {
    await git.init({ fs: this.fsp.fs, dir: this.dir, defaultBranch });
  }

  /** `git add <path>` — stages new/modified files, and deletions of tracked files. */
  async add(filepath: string): Promise<void> {
    const inWorkdir = await this.exists(`${this.dir}/${filepath}`);
    if (inWorkdir) {
      await git.add({ ...this.common, filepath });
    } else {
      const tracked = await this.isKnownToIndex(filepath);
      if (!tracked)
        throw new GitOpError(
          `fatal: pathspec '${filepath}' did not match any files`,
          128,
        );
      await git.remove({ ...this.common, filepath });
    }
    this.mergeState?.conflicted.delete(filepath);
  }

  /** `git add .` */
  async addAll(): Promise<void> {
    const matrix = await this.statusMatrix();
    for (const [filepath, , workdir, stage] of matrix) {
      if (workdir === 0 && stage !== 0) {
        await git.remove({ ...this.common, filepath });
      } else if (workdir === 2 && stage !== 2) {
        await git.add({ ...this.common, filepath });
      }
      this.mergeState?.conflicted.delete(filepath);
    }
  }

  private async isKnownToIndex(filepath: string): Promise<boolean> {
    const files = await git.listFiles(this.common);
    return files.includes(filepath);
  }

  async commit(opts: { message: string; author?: Persona; timestamp?: number }): Promise<string> {
    const author = {
      ...(opts.author ?? (await this.author())),
      timestamp: opts.timestamp ?? this.timestamp(),
      timezoneOffset: 0,
    };

    if (!this.mergeState && (await this.currentBranch()) === null && (await this.isInitialized())) {
      const head = await git.resolveRef({ ...this.common, ref: "HEAD" }).catch(() => null);
      if (head !== null) {
        throw new GitOpError(
          "fatal: you are in 'detached HEAD' state; commits here are not supported in this environment.\n" +
            "hint: use 'git switch -c <onoma>' to keep your work on a new branch, or 'git switch main' to go back.",
          128,
        );
      }
    }

    if (this.mergeState) {
      if (this.mergeState.conflicted.size > 0) {
        throw new GitOpError(
          "error: Committing is not possible because you have unmerged files.\n" +
            "hint: Fix them up in the work tree, and then use 'git add <file>'\n" +
            "hint: as appropriate to mark resolution and make a commit.\n" +
            "fatal: Exiting because of an unresolved conflict.",
        );
      }
      const { oursOid, theirsOid } = this.mergeState;
      const message = opts.message || this.mergeState.message;
      const oid = await git.commit({
        ...this.common,
        message,
        author,
        committer: author,
        parent: [oursOid, theirsOid],
      });
      await this.clearMergeState();
      this.recordReflog(oid, `commit (merge): ${message.split("\n")[0]}`, author.timestamp);
      return oid;
    }

    const oid = await git.commit({
      ...this.common,
      message: opts.message,
      author,
      committer: author,
    });
    this.recordReflog(oid, `commit: ${opts.message.split("\n")[0]}`, author.timestamp);
    return oid;
  }

  async branch(name: string, opts: { checkout?: boolean; startPoint?: string } = {}): Promise<void> {
    const existing = await this.listBranches();
    if (existing.includes(name))
      throw new GitOpError(`fatal: a branch named '${name}' already exists`, 128);
    await git.branch({
      ...this.common,
      ref: name,
      // isomorphic-git only resolves ref names / full oids (and swallows
      // failures) — revparse first so HEAD~1, HEAD@{n}, short hashes work
      object: opts.startPoint ? await this.resolve(opts.startPoint) : "HEAD",
      checkout: opts.checkout ?? false,
    });
  }

  async deleteBranch(name: string): Promise<void> {
    await git.deleteBranch({ ...this.common, ref: name });
  }

  async switchTo(ref: string, opts: { create?: boolean; startPoint?: string } = {}): Promise<void> {
    const from = (await this.currentBranch()) ?? (await this.resolve("HEAD").catch(() => "?"));
    await switchBranch(this, ref, opts);
    const oid = await this.resolve("HEAD");
    this.recordReflog(oid, `checkout: moving from ${from} to ${ref}`);
  }

  /** `git checkout <commit-ish>` / `git switch --detach` — HEAD at a raw oid. */
  async detach(target: string): Promise<string> {
    if (this.mergeState)
      throw new GitOpError(
        'fatal: cannot switch branch while merging\nConsider "git merge --abort" to abort the merge.',
        128,
      );
    await this.requireCleanTree("checkout");
    const oid = await this.resolve(target);
    const from = (await this.currentBranch()) ?? (await this.resolve("HEAD"));
    try {
      await git.checkout({ ...this.common, ref: oid });
    } catch {
      // some versions refuse non-ref checkout targets
    }
    // verify detachment; fall back to a manual HEAD write (we own the fs)
    const headNow = await git.resolveRef({ ...this.common, ref: "HEAD" }).catch(() => null);
    const branchNow = await this.currentBranch();
    if (headNow !== oid || branchNow !== null) {
      await git.checkout({ ...this.common, ref: oid, noUpdateHead: true, force: true });
      await this.writeFile(".git/HEAD", `${oid}\n`);
    }
    this.recordReflog(oid, `checkout: moving from ${from} to ${oid.slice(0, 7)}`);
    return oid;
  }

  async merge(theirsRef: string): Promise<MergeOutcome> {
    if (this.mergeState)
      throw new GitOpError(
        "error: Merging is not possible because you have unmerged files.\nfatal: Exiting because of an unresolved conflict.",
      );
    const branch = await this.currentBranch();
    if (!branch) throw new GitOpError("fatal: not on a branch", 128);

    let theirsOid: string;
    try {
      theirsOid = await this.resolve(theirsRef);
    } catch {
      throw new GitOpError(`merge: ${theirsRef} - not something we can merge`);
    }
    const oursOid = await this.resolve("HEAD");
    await this.requireCleanTree("merge");

    const author = {
      ...(await this.author()),
      timestamp: this.timestamp(),
      timezoneOffset: 0,
    };
    const message = `Merge branch '${theirsRef}'`;

    try {
      const r = await git.merge({
        ...this.common,
        ours: branch,
        theirs: theirsRef,
        abortOnConflict: false,
        author,
        committer: author,
        message,
      });
      // merge updates refs/trees; sync workdir + index to the new tip
      await git.checkout({ ...this.common, ref: branch, force: true });
      if (r.alreadyMerged) return { kind: "already-up-to-date" };
      if (r.fastForward) {
        this.recordReflog(r.oid!, `merge ${theirsRef}: Fast-forward`);
        return { kind: "fast-forward", oid: r.oid! };
      }
      this.recordReflog(r.oid!, `merge ${theirsRef}: Merge made by the 'ort' strategy.`);
      return { kind: "merge-commit", oid: r.oid! };
    } catch (e: any) {
      if (e?.code === "MergeConflictError") {
        const conflicted: string[] = e.data?.filepaths ?? [];
        this.mergeState = {
          theirsRef,
          theirsOid,
          oursOid,
          conflicted: new Set(conflicted),
          message,
        };
        await this.writeFile(".git/MERGE_HEAD", `${theirsOid}\n`);
        await this.writeFile(".git/MERGE_MSG", `${message}\n`);
        // real git stages the cleanly-merged files; isomorphic-git only wrote
        // them to the worktree. The tree was clean before the merge, so every
        // non-conflicted difference here IS a merge result — mirror it into
        // the index or the final merge commit silently drops it.
        for (const [filepath, , workdir, stage] of await this.statusMatrix()) {
          if (this.mergeState.conflicted.has(filepath)) continue;
          if ((workdir === 2 && stage !== 2) || (workdir === 0 && stage !== 0)) {
            await this.add(filepath);
          }
        }
        return { kind: "conflict", conflicted };
      }
      throw e;
    }
  }

  async abortMerge(): Promise<void> {
    if (!this.mergeState)
      throw new GitOpError("fatal: There is no merge to abort (MERGE_HEAD missing).", 128);
    await git.abortMerge(this.common);
    await this.clearMergeState();
  }

  private async clearMergeState(): Promise<void> {
    this.mergeState = null;
    for (const f of [".git/MERGE_HEAD", ".git/MERGE_MSG"]) {
      try {
        await this.fsp.promises.unlink(`${this.dir}/${f}`);
      } catch {
        // already absent
      }
    }
  }

  async reset(mode: "soft" | "mixed" | "hard", target: string): Promise<void> {
    const oid = await resetOp(this, mode, target);
    if (mode !== "soft") await this.clearMergeState();
    this.recordReflog(oid, `reset: moving to ${target}`);
  }

  async revert(target: string): Promise<string> {
    return revertOp(this, target);
  }

  async cherryPick(target: string): Promise<string> {
    return cherryPickOp(this, target);
  }

  async restore(
    paths: string[],
    opts: { staged: boolean; worktree: boolean },
  ): Promise<void> {
    return restoreOp(this, paths, opts);
  }

  /** `git stash push` — no HEAD reflog entry: real git logs stashes to refs/stash. */
  async stashPush(
    opts: { message?: string; includeUntracked?: boolean } = {},
  ): Promise<StashPushResult> {
    return stashPush(this, opts);
  }

  async stashApply(index: number): Promise<StashEntry> {
    return stashApply(this, index);
  }

  async stashPop(index: number): Promise<StashEntry> {
    return stashPop(this, index);
  }

  stashDrop(index: number): StashEntry {
    return stashDrop(this, index);
  }

  stashClear(): void {
    this.stash = [];
  }

  async requireCleanTree(action: string): Promise<void> {
    const matrix = await this.statusMatrix();
    const dirty = matrix
      .filter(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1))
      .filter(([, head, workdir, stage]) => !(head === 0 && workdir === 2 && stage === 0)) // untracked ok
      .map(([f]) => f);
    if (dirty.length > 0) {
      throw new GitOpError(
        `error: Your local changes to the following files would be overwritten by ${action}:\n` +
          dirty.map((f) => `\t${f}`).join("\n") +
          `\nPlease commit your changes or stash them before you ${action}.\nAborting`,
      );
    }
  }

  async snapshot(): Promise<RepoState> {
    return buildRepoState(this);
  }
}

export { git };
