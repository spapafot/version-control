import { describe, it, expect } from "vitest";
import { createMemFs } from "./fs";
import { GitEngine } from "./engine";
import { runSetup, type SetupStep } from "./setup";
import { GitOpError } from "./errors";

function fresh(): GitEngine {
  return new GitEngine(createMemFs());
}

async function seeded(steps: SetupStep[]): Promise<GitEngine> {
  const engine = fresh();
  await runSetup(engine, steps);
  return engine;
}

const BASIC: SetupStep[] = [
  { do: "file", path: "README.md", content: "# hello\n" },
  { do: "init" },
  { do: "add", paths: ["README.md"] },
  { do: "commit", message: "Initial commit" },
];

describe("basic flow (spike: memfs + isomorphic-git)", () => {
  it("init → add → commit → snapshot", async () => {
    const engine = await seeded(BASIC);
    const s = await engine.snapshot();
    expect(s.initialized).toBe(true);
    expect(s.head.ref).toBe("main");
    expect(s.branches.map((b) => b.name)).toEqual(["main"]);
    expect(s.commits).toHaveLength(1);
    expect(s.commits[0].message).toBe("Initial commit");
    expect(s.commits[0].files).toEqual(["README.md"]);
    expect(s.headFiles).toEqual(["README.md"]);
    expect(s.status.every((f) => !f.staged && !f.unstaged && !f.untracked)).toBe(true);
  });

  it("unborn HEAD: snapshot after bare init works", async () => {
    const engine = await seeded([
      { do: "file", path: "a.txt", content: "a\n" },
      { do: "init" },
    ]);
    const s = await engine.snapshot();
    expect(s.initialized).toBe(true);
    expect(s.head.ref).toBe("main");
    expect(s.head.oid).toBeNull();
    expect(s.commits).toHaveLength(0);
    expect(s.status).toEqual([
      { path: "a.txt", staged: null, unstaged: null, untracked: true, conflicted: false },
    ]);
  });

  it("stage/modify/delete classification", async () => {
    const engine = await seeded([
      { do: "file", path: "a.txt", content: "a\n" },
      { do: "file", path: "b.txt", content: "b\n" },
      { do: "file", path: "c.txt", content: "c\n" },
      { do: "init" },
      { do: "add", paths: "*" },
      { do: "commit", message: "base" },
    ]);
    await engine.writeFile("a.txt", "a2\n"); // modified, unstaged
    await engine.writeFile("b.txt", "b2\n");
    await engine.add("b.txt"); // modified, staged
    await engine.deleteFile("c.txt");
    await engine.add("c.txt"); // deletion staged via add
    await engine.writeFile("d.txt", "d\n"); // untracked

    const byPath = Object.fromEntries((await engine.snapshot()).status.map((f) => [f.path, f]));
    expect(byPath["a.txt"]).toMatchObject({ staged: null, unstaged: "modified" });
    expect(byPath["b.txt"]).toMatchObject({ staged: "modified", unstaged: null });
    expect(byPath["c.txt"]).toMatchObject({ staged: "deleted" });
    expect(byPath["d.txt"]).toMatchObject({ untracked: true });
  });

  it("racy index: same-size rapid writes are still detected", async () => {
    // regression: statusMatrix trusts size+mtime; two same-length writes in the
    // same millisecond used to be invisible, silently committing a stale tree
    const engine = await seeded([
      ...BASIC,
      { do: "file", path: "README.md", content: "# aaaaa\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "v2" },
      { do: "file", path: "README.md", content: "# bbbbb\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "v3" },
    ]);
    const s = await engine.snapshot();
    const v3 = s.commits.find((c) => c.message === "v3")!;
    const v2 = s.commits.find((c) => c.message === "v2")!;
    expect(v3.parents).toEqual([v2.oid]);
    expect(await engine.readFile("README.md")).toBe("# bbbbb\n");
    // the committed tree must actually differ between v2 and v3
    const { git } = await import("./engine");
    const b2 = await git.readBlob({ fs: engine.fsp.fs, dir: engine.dir, oid: v2.oid, filepath: "README.md" });
    const b3 = await git.readBlob({ fs: engine.fsp.fs, dir: engine.dir, oid: v3.oid, filepath: "README.md" });
    expect(new TextDecoder().decode(b3.blob)).toBe("# bbbbb\n");
    expect(b2.oid).not.toBe(b3.oid);
  });

  it("deterministic: same setup → identical head oid", async () => {
    const a = await seeded(BASIC);
    const b = await seeded(BASIC);
    expect((await a.snapshot()).head.oid).toBe((await b.snapshot()).head.oid);
  });
});

describe("branches and merges", () => {
  const TWO_BRANCH: SetupStep[] = [
    ...BASIC,
    { do: "branch", name: "feature" },
    { do: "switch", ref: "feature" },
    { do: "file", path: "feature.txt", content: "f\n" },
    { do: "add", paths: ["feature.txt"] },
    { do: "commit", message: "Add feature" },
    { do: "switch", ref: "main" },
  ];

  it("fast-forward merge", async () => {
    const engine = await seeded(TWO_BRANCH);
    const r = await engine.merge("feature");
    expect(r.kind).toBe("fast-forward");
    const s = await engine.snapshot();
    expect(s.branches.find((b) => b.name === "main")!.oid).toBe(
      s.branches.find((b) => b.name === "feature")!.oid,
    );
    // workdir synced
    expect(await engine.readFile("feature.txt")).toBe("f\n");
  });

  it("true merge commit (diverged branches)", async () => {
    const engine = await seeded([
      ...TWO_BRANCH,
      { do: "file", path: "main.txt", content: "m\n" },
      { do: "add", paths: ["main.txt"] },
      { do: "commit", message: "Main work" },
    ]);
    const r = await engine.merge("feature");
    expect(r.kind).toBe("merge-commit");
    const s = await engine.snapshot();
    expect(s.commits[0].isMerge).toBe(true);
    expect(s.commits[0].parents).toHaveLength(2);
    expect(await engine.readFile("feature.txt")).toBe("f\n");
  });

  it("switch refuses to lose changes", async () => {
    const engine = await seeded(TWO_BRANCH);
    // README exists on both branches; modify it on main then try to switch
    await engine.writeFile("README.md", "changed\n");
    await engine.add("README.md");
    await engine.writeFile("README.md", "changed more\n");
    await expect(engine.switchTo("feature")).rejects.toThrow(GitOpError);
  });
});

describe("merge conflicts (spike: abortOnConflict + statusMatrix overlay)", () => {
  const CONFLICT: SetupStep[] = [
    { do: "file", path: "app.js", content: "console.log('v1');\n" },
    { do: "init" },
    { do: "add", paths: "*" },
    { do: "commit", message: "base" },
    { do: "branch", name: "feature" },
    { do: "file", path: "app.js", content: "console.log('main change');\n" },
    { do: "add", paths: "*" },
    { do: "commit", message: "main edit" },
    { do: "switch", ref: "feature" },
    { do: "file", path: "app.js", content: "console.log('feature change');\n" },
    { do: "add", paths: "*" },
    { do: "commit", message: "feature edit" },
    { do: "switch", ref: "main" },
  ];

  it("conflict writes markers, sets state, snapshot survives, resolve → 2-parent commit", async () => {
    const engine = await seeded(CONFLICT);
    const r = await engine.merge("feature");
    expect(r.kind).toBe("conflict");
    if (r.kind !== "conflict") throw new Error("unreachable");
    expect(r.conflicted).toEqual(["app.js"]);

    // conflict markers on disk
    const content = await engine.readFile("app.js");
    expect(content).toContain("<<<<<<<");
    expect(content).toContain("=======");
    expect(content).toContain(">>>>>>>");

    // MERGE_HEAD written
    expect(await engine.exists("/repo/.git/MERGE_HEAD")).toBe(true);

    // snapshot survives stage-1/2/3 entries and reports the conflict
    const s = await engine.snapshot();
    expect(s.merge.inProgress).toBe(true);
    expect(s.merge.conflicted).toEqual(["app.js"]);
    expect(s.status.find((f) => f.path === "app.js")!.conflicted).toBe(true);

    // commit refused while unresolved
    await expect(engine.commit({ message: "nope" })).rejects.toThrow(/unmerged files/);

    // resolve → add → commit
    await engine.writeFile("app.js", "console.log('merged');\n");
    await engine.add("app.js");
    const oid = await engine.commit({ message: "" }); // falls back to MERGE_MSG
    const s2 = await engine.snapshot();
    expect(s2.merge.inProgress).toBe(false);
    expect(s2.commits[0].oid).toBe(oid);
    expect(s2.commits[0].parents).toHaveLength(2);
    expect(s2.commits[0].message).toContain("Merge branch 'feature'");
    expect(await engine.exists("/repo/.git/MERGE_HEAD")).toBe(false);
  });

  it("merge --abort restores pre-merge state", async () => {
    const engine = await seeded(CONFLICT);
    await engine.merge("feature");
    await engine.abortMerge();
    const s = await engine.snapshot();
    expect(s.merge.inProgress).toBe(false);
    expect(await engine.readFile("app.js")).toBe("console.log('main change');\n");
    expect(s.status.find((f) => f.path === "app.js")).toMatchObject({
      staged: null,
      unstaged: null,
      conflicted: false,
    });
  });

  it("setup can leave the user mid-conflict", async () => {
    const engine = await seeded([...CONFLICT, { do: "merge", ref: "feature" }]);
    const s = await engine.snapshot();
    expect(s.merge.inProgress).toBe(true);
    expect(s.merge.conflicted).toEqual(["app.js"]);
  });
});

describe("restore (spike: resetIndex on file absent from HEAD)", () => {
  it("restore --staged of a newly added file unstages it", async () => {
    const engine = await seeded(BASIC);
    await engine.writeFile("new.txt", "n\n");
    await engine.add("new.txt");
    await engine.restore(["new.txt"], { staged: true, worktree: false });
    const byPath = Object.fromEntries((await engine.snapshot()).status.map((f) => [f.path, f]));
    expect(byPath["new.txt"]).toMatchObject({ staged: null, untracked: true });
    expect(await engine.readFile("new.txt")).toBe("n\n"); // content kept
  });

  it("restore --staged of a modified tracked file keeps workdir changes", async () => {
    const engine = await seeded(BASIC);
    await engine.writeFile("README.md", "# changed\n");
    await engine.add("README.md");
    await engine.restore(["README.md"], { staged: true, worktree: false });
    const byPath = Object.fromEntries((await engine.snapshot()).status.map((f) => [f.path, f]));
    expect(byPath["README.md"]).toMatchObject({ staged: null, unstaged: "modified" });
    expect(await engine.readFile("README.md")).toBe("# changed\n");
  });

  it("restore <file> discards workdir changes (from index)", async () => {
    const engine = await seeded(BASIC);
    await engine.writeFile("README.md", "# changed\n");
    await engine.restore(["README.md"], { staged: false, worktree: true });
    expect(await engine.readFile("README.md")).toBe("# hello\n");
  });

  it("restore of unknown path errors like git", async () => {
    const engine = await seeded(BASIC);
    await expect(
      engine.restore(["ghost.txt"], { staged: false, worktree: true }),
    ).rejects.toThrow(/did not match any file/);
  });
});

describe("reset", () => {
  const TWO_COMMITS: SetupStep[] = [
    ...BASIC,
    { do: "file", path: "second.txt", content: "2\n" },
    { do: "add", paths: ["second.txt"] },
    { do: "commit", message: "Second commit" },
  ];

  it("--soft moves ref, keeps index + workdir", async () => {
    const engine = await seeded(TWO_COMMITS);
    await engine.reset("soft", "HEAD~1");
    const s = await engine.snapshot();
    expect(s.commits.filter((c) => reachable(s, c.oid)).length).toBe(1);
    const byPath = Object.fromEntries(s.status.map((f) => [f.path, f]));
    expect(byPath["second.txt"]).toMatchObject({ staged: "added" });
    expect(await engine.readFile("second.txt")).toBe("2\n");
  });

  it("--mixed moves ref, resets index, keeps workdir", async () => {
    const engine = await seeded(TWO_COMMITS);
    await engine.reset("mixed", "HEAD~1");
    const byPath = Object.fromEntries((await engine.snapshot()).status.map((f) => [f.path, f]));
    expect(byPath["second.txt"]).toMatchObject({ staged: null, untracked: true });
    expect(await engine.readFile("second.txt")).toBe("2\n");
  });

  it("--hard resets everything", async () => {
    const engine = await seeded(TWO_COMMITS);
    await engine.reset("hard", "HEAD~1");
    const s = await engine.snapshot();
    expect(s.head.oid).toBe(s.commits.find((c) => c.message === "Initial commit")!.oid);
    expect(await engine.exists("/repo/second.txt")).toBe(false);
    expect(s.status.every((f) => !f.staged && !f.unstaged && !f.untracked)).toBe(true);
  });

  function reachable(s: { commits: Array<{ oid: string; parents: string[] }>; head: { oid: string | null } }, oid: string): boolean {
    const byOid = new Map(s.commits.map((c) => [c.oid, c]));
    let cur = s.head.oid;
    while (cur) {
      if (cur === oid) return true;
      cur = byOid.get(cur)?.parents[0] ?? null;
    }
    return false;
  }
});

describe("revert", () => {
  it("reverts the head commit with a new inverse commit", async () => {
    const engine = await seeded([
      ...BASIC,
      { do: "file", path: "bug.js", content: "broken\n" },
      { do: "file", path: "README.md", content: "# hello\n\nbroken docs\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "Break everything" },
    ]);
    const oid = await engine.revert("HEAD");
    const s = await engine.snapshot();
    expect(s.head.oid).toBe(oid);
    expect(s.commits[0].message).toContain('Revert "Break everything"');
    expect(await engine.exists("/repo/bug.js")).toBe(false); // added file removed
    expect(await engine.readFile("README.md")).toBe("# hello\n"); // modification undone
    expect(s.status.every((f) => !f.staged && !f.unstaged && !f.untracked)).toBe(true);
    // history preserved: revert adds, never rewrites
    expect(s.commits.map((c) => c.message.split("\n")[0])).toEqual([
      'Revert "Break everything"',
      "Break everything",
      "Initial commit",
    ]);
  });

  it("refuses revert when the file changed since (non-clean)", async () => {
    const engine = await seeded([
      ...BASIC,
      { do: "file", path: "README.md", content: "# v2\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "v2" },
      { do: "file", path: "README.md", content: "# v3\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "v3" },
    ]);
    await expect(engine.revert("HEAD~1")).rejects.toThrow(/could not revert/);
  });
});

describe("revparse", () => {
  it("resolves HEAD~1, short oids, branch names", async () => {
    const engine = await seeded([
      ...BASIC,
      { do: "file", path: "x.txt", content: "x\n" },
      { do: "add", paths: "*" },
      { do: "commit", message: "second" },
    ]);
    const s = await engine.snapshot();
    const first = s.commits.find((c) => c.message === "Initial commit")!.oid;
    expect(await engine.resolve("HEAD~1")).toBe(first);
    expect(await engine.resolve("HEAD^")).toBe(first);
    expect(await engine.resolve(first.slice(0, 7))).toBe(first);
    expect(await engine.resolve("main")).toBe(s.head.oid);
    await expect(engine.resolve("nonsense")).rejects.toThrow(/unknown revision/);
  });
});
