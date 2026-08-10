import * as git from "isomorphic-git";
import { GitOpError } from "../errors";
import type { GitEngine } from "../engine";

export async function switchBranch(
  engine: GitEngine,
  ref: string,
  opts: { create?: boolean; startPoint?: string } = {},
): Promise<void> {
  if (engine.mergeState)
    throw new GitOpError(
      "fatal: cannot switch branch while merging\nConsider \"git merge --abort\" to abort the merge.",
      128,
    );

  if (opts.create) {
    await engine.branch(ref, { startPoint: opts.startPoint, checkout: true });
    return;
  }

  const branches = await engine.listBranches();
  if (!branches.includes(ref)) {
    // `switch` only takes branches (no detached HEAD in the MVP)
    throw new GitOpError(`fatal: invalid reference: ${ref}`, 128);
  }

  try {
    await git.checkout({
      fs: engine.fsp.fs,
      dir: engine.dir,
      cache: engine.cache,
      ref,
    });
  } catch (e: any) {
    if (e?.code === "CheckoutConflictError") {
      const files: string[] = e.data?.filepaths ?? [];
      throw new GitOpError(
        "error: Your local changes to the following files would be overwritten by checkout:\n" +
          files.map((f) => `\t${f}`).join("\n") +
          "\nPlease commit your changes or stash them before you switch branches.\nAborting",
      );
    }
    throw e;
  }
}
